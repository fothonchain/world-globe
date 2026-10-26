#!/usr/bin/env python3
"""World Globe server: static files from ./public + the news feed. Python 3 standard library only, no keys.
Usage: python3 server.py [port]           -> http://127.0.0.1:8770/  (this machine only)
       python3 server.py [port] --lan     -> also reachable from your local network (read-only app, no secrets)
       python3 server.py [port] --demo    -> serve test/demo_headlines.json instead of the live feeds (offline work, screenshots)
  GET /api/world -> {fetchedAt, headlines: [{title, summary, url, source, at}], errors: {source: error}, sources: [names]}
                    World RSS feeds (fixed list, no user-supplied URLs), fetched in parallel, each cached 10 minutes;
                    a feed that fails keeps serving its last good copy. Browsers cannot read these feeds directly (CORS).
In localhost mode requests whose Host header is not 127.0.0.1 / localhost get 403 (blocks DNS rebinding)."""
import concurrent.futures, html, http.server, json, os, re, socketserver, sys, threading, time, urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
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
}
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

def _fetch(name):
    label, url = FEEDS[name]
    return time.time(), parse_rss(_get(url), label)

def demo():
    with open(os.path.join(ROOT, "test", "demo_headlines.json")) as f:
        rows, now = json.load(f), time.time() * 1000
    heads = [{"title": r["title"], "summary": r.get("summary", ""), "url": "https://example.com/demo/%d" % i, "source": r["source"], "at": int(now - r["hoursAgo"] * 3600e3)} for i, r in enumerate(rows)]
    return {"fetchedAt": int(now), "errors": {}, "sources": sorted({r["source"] for r in rows}), "headlines": heads, "demo": True}

def world():
    if DEMO:
        return demo()
    now, out, heads = time.time(), {"fetchedAt": int(time.time() * 1000), "errors": {}, "sources": [v[0] for v in FEEDS.values()]}, []
    with _lock:
        stale = [n for n in FEEDS if not _cache.get(n) or now - _cache[n][0] > MAX_AGE]
    if stale:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(stale)) as ex:
            for name, fut in [(n, ex.submit(_fetch, n)) for n in stale]:
                try:
                    hit = fut.result()
                    with _lock:
                        _cache[name] = hit
                except Exception as e:  # keep serving the last good copy
                    out["errors"][FEEDS[name][0]] = type(e).__name__
    with _lock:
        for name in FEEDS:
            if _cache.get(name):
                heads += _cache[name][1]
    out["headlines"] = sorted(heads, key=lambda h: -h["at"])[:300]
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
