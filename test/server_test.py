# python3 test/server_test.py : RSS parsing and the demo feed (no network)
import os, sys
sys.argv = ["server.py", "--demo"]
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server
raw = b"""<rss><channel>
<item><title>Iran &amp; the &lt;b&gt;Strait</title><link>https://x.com/a</link><pubDate>Mon, 26 Oct 2026 04:00:00 GMT</pubDate><description><![CDATA[<p>Tankers  wait.</p>]]></description></item>
<item><title>plain http link is dropped</title><link>http://x.com/b</link><pubDate>Mon, 26 Oct 2026 04:00:00 GMT</pubDate></item>
<item><title>no date is dropped</title><link>https://x.com/c</link></item>
</channel></rss>"""
r = server.parse_rss(raw, "T")
assert len(r) == 1 and r[0]["title"] == "Iran & the Strait" and r[0]["summary"] == "Tankers wait." and r[0]["at"] == 1792987200000, r
d = server.world()
assert d["demo"] and len(d["headlines"]) > 20 and all(h["url"].startswith("https://") for h in d["headlines"])
print("ok - server: rss parsing + demo feed")

yt = b"""<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
<entry><yt:videoId>abcDEF12345</yt:videoId><title>Russia strikes Kyiv overnight | Al Jazeera Newsfeed</title><published>2026-10-26T04:00:00+00:00</published>
<media:group><media:description>Footage from the city.</media:description></media:group></entry>
<entry><yt:videoId>bad id"&lt;x</yt:videoId><title>odd id is dropped</title><published>2026-10-26T04:00:00+00:00</published></entry>
</feed>"""
v = server.parse_youtube(yt, "Al Jazeera")
assert len(v) == 1 and v[0]["video"] == "abcDEF12345" and v[0]["title"] == "Russia strikes Kyiv overnight" and v[0]["summary"] == "Footage from the city." and v[0]["at"] == 1792987200000, v
assert v[0]["url"] == "https://www.youtube.com/watch?v=abcDEF12345"
print("ok - server: youtube feed parsing")
