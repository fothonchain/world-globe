#!/usr/bin/env python3
"""Write the news file for the static site: public/data/world.json, the same JSON server.py serves at /api/world.
Run by the GitHub Action (.github/workflows/pages.yml) every 30 minutes before publishing to GitHub Pages.
Usage: python3 scripts/build_feed.py [--demo]   (fails if every feed failed, so a broken run never replaces a good site)"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # reads --demo from sys.argv

d = server.world()
if not d["headlines"]:
    sys.exit("no headlines: every feed failed " + json.dumps(d["errors"]))
os.makedirs(os.path.join(ROOT, "public", "data"), exist_ok=True)
with open(os.path.join(ROOT, "public", "data", "world.json"), "w") as f:
    json.dump(d, f, separators=(",", ":"))
print(f"{len(d['headlines'])} headlines, failed feeds: {d['errors'] or 'none'}")
print(f"{len(d.get('calendar', []))} calendar events; channels: " + (", ".join(f"{k}={v['id']}" + (" (latest ok)" if v.get("latest") else "") for k, v in d.get("channels", {}).items()) or "none"))
