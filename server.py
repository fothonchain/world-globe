#!/usr/bin/env python3
"""World Globe server: static files from ./public + the news feed. Python 3 standard library only, no keys.
Usage: python3 server.py [port]           -> http://127.0.0.1:8770/  (this machine only)
       python3 server.py [port] --lan     -> also reachable from your local network (read-only app, no secrets)
       python3 server.py [port] --demo    -> serve test/demo_headlines.json instead of the live feeds (offline work, screenshots)
  GET /api/world -> {fetchedAt, headlines: [{title, summary, url, source, at, video?}], errors: {source: error}, sources: [names],
                     calendar: [{title, country, impact, at, forecast, previous}], channels: {key: {name, id, latest?}}}
                    calendar = this week's economic calendar (faireconomy / ForexFactory JSON, major currencies, High + Medium);
                    channels = official / finance-TV YouTube channels for live streams, resolved from their @handles;
                    World RSS feeds + news channels' YouTube feeds (video = YouTube id), a fixed list (no user-supplied URLs),
                    fetched in parallel, each cached 10 minutes;
                    a feed that fails keeps serving its last good copy. Browsers cannot read these feeds directly (CORS).
In localhost mode requests whose Host header is not 127.0.0.1 / localhost get 403 (blocks DNS rebinding)."""
import concurrent.futures, html, http.server, json, os, re, socketserver, sys, threading, time, urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
LAN, DEMO = "--lan" in sys.argv, "--demo" in sys.argv
PORT = int(ARGS[0]) if ARGS else 8770
HOST = "0.0.0.0" if LAN else "127.0.0.1"
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}

UA = {"User-Agent": "Mozilla/5.0 (World Globe news reader)"}
FEEDS = {  # name: (label, url)
    "bbc_world": ("BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    "bbc_business": ("BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    "aljazeera": ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    "guardian": ("The Guardian", "https://www.theguardian.com/world/rss"),
    "npr": ("NPR", "https://feeds.npr.org/1004/rss.xml"),
    "france24": ("France 24", "https://www.france24.com/en/rss"),
    "cnbc": ("CNBC", "https://www.cnbc.com/id/100727362/device/rss/rss.html"),
    "techcrunch_ai": ("TechCrunch", "https://techcrunch.com/category/artificial-intelligence/feed/"),
    "coindesk": ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    "cointelegraph": ("Cointelegraph", "https://cointelegraph.com/rss"),
    "decrypt": ("Decrypt", "https://decrypt.co/feed"),
    "billboard": ("Billboard", "https://www.billboard.com/feed/"),
    "rollingstone": ("Rolling Stone", "https://www.rollingstone.com/music/music-news/feed/"),
    "pitchfork": ("Pitchfork", "https://pitchfork.com/feed/feed-news/rss"),
    "nme": ("NME", "https://www.nme.com/news/music/feed"),
}
YT = "https://www.youtube.com/feeds/videos.xml?channel_id="
VIDEOS = {  # news channels' public YouTube feeds (no key): videos become headlines with a video id, the page embeds them
    "yt_aljazeera": ("Al Jazeera", YT + "UCNye-wNBqNL5ZzHSJj3l8Bg"),
    "yt_bbc": ("BBC", YT + "UC16niRr50-MSBwiO3YDb3RA"),
    "yt_dw": ("DW News", YT + "UCknLrEdhRCp1aegoMqRaCZg"),
    "yt_france24": ("France 24", YT + "UCQfwfsi5VrQ8yKZ-UWmAEFg"),
    "yt_sky": ("Sky News", YT + "UCoMdktPbSTixAyNGwb-UYkQ"),
}
ALL = dict(FEEDS, **VIDEOS)
MAX_AGE = 600
_cache, _lock = {}, threading.Lock()

def _get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
        return r.read(2_000_000)

def _clean(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()

def parse_rss(raw, source, limit=40):
    out = []
    for it in ET.fromstring(raw).iter("item"):
        title, link = _clean(it.findtext("title")), (it.findtext("link") or "").strip()
        if not title or not link.startswith("https://"):
            continue
        try:
            at = int(parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
        except Exception:
            continue
        out.append({"title": title[:200], "summary": _clean(it.findtext("description"))[:300], "url": link[:400], "source": source, "at": at})
    return out[:limit]

A, YTNS, MEDIA = "{http://www.w3.org/2005/Atom}", "{http://www.youtube.com/xml/schemas/2015}", "{http://search.yahoo.com/mrss/}"
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
def parse_youtube(raw, source, limit=15):
    out = []
    for e in ET.fromstring(raw).iter(A + "entry"):
        vid, title = (e.findtext(YTNS + "videoId") or "").strip(), _clean(e.findtext(A + "title"))
        title = re.sub(r"\s*[|｜]\s*[^|｜]*$", "", title) or title  # drop the channel's " | Al Jazeera Newsfeed" style suffix
        if not VIDEO_ID.match(vid) or not title:
            continue
        try:
            at = int(datetime.fromisoformat(e.findtext(A + "published")).timestamp() * 1000)
        except Exception:
            continue
        group = e.find(MEDIA + "group")
        desc = _clean(group.findtext(MEDIA + "description")) if group is not None else ""
        out.append({"title": title[:200], "summary": desc[:300], "url": "https://www.youtube.com/watch?v=" + vid, "source": source, "at": at, "video": vid})
    return out[:limit]

def _fetch(name):
    label, url = ALL[name]
    return time.time(), (parse_youtube if name in VIDEOS else parse_rss)(_get(url), label)

def demo():
    with open(os.path.join(ROOT, "test", "demo_headlines.json")) as f:
        rows, now = json.load(f), time.time() * 1000
    heads = [{"title": r["title"], "summary": r.get("summary", ""), "url": "https://example.com/demo/%d" % i, "source": r["source"], "at": int(now - r["hoursAgo"] * 3600e3), **({"video": r["video"]} if r.get("video") else {})} for i, r in enumerate(rows)]
    h = 3600e3  # demo calendar: one event live now, the rest around it (placeholder channel ids: the players show "unavailable")
    cal = [{"title": t, "country": c, "impact": "High", "at": int(now + o * h), "forecast": f, "previous": p} for t, c, o, f, p in [
        ("CPI m/m", "USD", -20, "0.3%", "0.4%"), ("Federal Funds Rate", "USD", -0.3, "4.25%", "4.50%"), ("FOMC Press Conference", "USD", 0.5, "", ""),
        ("Main Refinancing Rate", "EUR", 22, "2.00%", "2.00%"), ("BOJ Policy Rate", "JPY", 40, "0.50%", "0.50%"), ("Non-Farm Employment Change", "USD", 70, "120K", "95K")]]
    chans = {k: {"name": CHANNELS[k][0], "id": "UC" + k.ljust(22, "0")[:22], "latest": {"id": "demo0000000", "title": CHANNELS[k][0] + " (demo video)", "at": int(now - 5 * h)}} for k in CHANNELS}
    return {"fetchedAt": int(now), "errors": {}, "sources": sorted({r["source"] for r in rows}), "headlines": heads, "demo": True, "calendar": cal, "channels": chans}

CAL_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
MAJORS = {"USD", "EUR", "GBP", "JPY", "CNY", "CAD", "AUD", "NZD", "CHF"}
def parse_calendar(raw):
    out = []
    for e in json.loads(raw):
        if e.get("country") not in MAJORS or e.get("impact") not in ("High", "Medium"):
            continue
        try:
            at = int(datetime.fromisoformat(e["date"]).timestamp() * 1000)
        except Exception:
            continue
        out.append({"title": str(e.get("title", ""))[:120], "country": e["country"], "impact": e["impact"], "at": at,
                    "forecast": str(e.get("forecast", ""))[:20], "previous": str(e.get("previous", ""))[:20]})
    return out

# live streams: the page embeds youtube.com/embed/live_stream?channel=<id>, which plays the channel's current live stream
CHANNELS = {  # key: (name, @handles to try, best first)
    "fed": ("Federal Reserve", ["@federalreserve"]),
    "ecb": ("European Central Bank", ["@ecbeuro", "@europeancentralbank"]),
    "boe": ("Bank of England", ["@bankofengland", "@BankofEnglandUK"]),
    "cnbc": ("CNBC Television", ["@CNBCtelevision"]),
    "bloomberg": ("Bloomberg Television", ["@markets", "@BloombergTelevision"]),
    "yahoo": ("Yahoo Finance", ["@YahooFinance"]),
}
CHANNEL_ID = re.compile(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[A-Za-z0-9_-]{22})"|"externalId":"(UC[A-Za-z0-9_-]{22})"')
def resolve_handle(handle):
    m = CHANNEL_ID.search(_get("https://www.youtube.com/" + handle).decode("utf-8", "replace"))
    if not m:
        raise ValueError("no channel id on the page")
    return m.group(1) or m.group(2)
def _channel(key):
    name, handles = CHANNELS[key]
    last = None
    for h in handles:
        try:
            cid = resolve_handle(h)
            break
        except Exception as e:
            last = e
    else:
        raise last
    ch = {"name": name, "id": cid}
    try:
        vids = parse_youtube(_get(YT + cid), name, 1)
        if vids:
            ch["latest"] = {"id": vids[0]["video"], "title": vids[0]["title"], "at": vids[0]["at"]}
    except Exception:
        pass
    return ch

def extras(out):
    """calendar + channels into out (cached: calendar 30 min, channels 3 h); failures go to out['errors']"""
    now, jobs = time.time(), {}
    with _lock:
        cal, chans = _cache.get("calendar"), {k: _cache.get("ch_" + k) for k in CHANNELS}
    with concurrent.futures.ThreadPoolExecutor(max_workers=1 + len(CHANNELS)) as ex:
        if not cal or now - cal[0] > 1800:
            jobs["calendar"] = ex.submit(lambda: parse_calendar(_get(CAL_URL)))
        for k, hit in chans.items():
            if not hit or now - hit[0] > 3 * 3600:
                jobs["ch_" + k] = ex.submit(_channel, k)
        for name, fut in jobs.items():
            try:
                val = fut.result()
                with _lock:
                    _cache[name] = (now, val)
            except Exception as e:
                out["errors"]["Calendar" if name == "calendar" else CHANNELS[name[3:]][0] + " live"] = type(e).__name__
    with _lock:
        out["calendar"] = (_cache.get("calendar") or (0, []))[1]
        out["channels"] = {k: _cache["ch_" + k][1] for k in CHANNELS if _cache.get("ch_" + k)}

def world():
    if DEMO:
        return demo()
    now, out, heads = time.time(), {"fetchedAt": int(time.time() * 1000), "errors": {}, "sources": sorted({v[0] for v in ALL.values()})}, []
    with _lock:
        stale = [n for n in ALL if not _cache.get(n) or now - _cache[n][0] > MAX_AGE]
    if stale:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(stale)) as ex:
            for name, fut in [(n, ex.submit(_fetch, n)) for n in stale]:
                try:
                    hit = fut.result()
                    with _lock:
                        _cache[name] = hit
                except Exception as e:  # keep serving the last good copy
                    out["errors"][ALL[name][0] + (" video" if name in VIDEOS else "")] = type(e).__name__
    with _lock:
        for name in ALL:
            if _cache.get(name):
                heads += _cache[name][1]
    out["headlines"] = sorted(heads, key=lambda h: -h["at"])[:800]
    extras(out)
    return out

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=os.path.join(ROOT, "public"), **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a):
        pass
    def do_GET(self):
        if not LAN and self.headers.get("Host") not in ALLOWED_HOSTS:
            return self._json(403, {"error": "host not allowed"})
        if urlparse(self.path).path == "/api/world":
            return self._json(200, world())
        return super().do_GET()
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    print(f"World Globe on http://127.0.0.1:{PORT}/" + ("  (LAN mode: reachable from your network)" if LAN else "") + ("  (DEMO headlines)" if DEMO else ""))
    S((HOST, PORT), H).serve_forever()
