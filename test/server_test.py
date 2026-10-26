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
