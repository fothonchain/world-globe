# CLAUDE.md (world-globe)

README.md is the overview. Working rules:

- Keep it dependency-free: Python 3 stdlib server, plain browser JS, vendored libraries in public/vendor (no CDN at run time, no build step).
- public/geo.js is pure logic (no DOM): browser window.Geo and node module.exports. UI lives in public/app.js.
- Placing / ranking is keyword rules: say so in the UI, and fix a misplaced story by adding a gazetteer entry in geo.js with a test, not by special-casing the UI.
- Feeds: fixed URLs only in server.py (never fetch a URL from a request); only https links are rendered; all feed text is escaped.
- Performance: never rebuild DOM per frame; use setHTML / setText (change-only) and only call globe data setters when the pin set changes.
- Tests after any logic change: node test/geo.test.js && python3 test/server_test.py
- UI changes: check in a real browser with python3 server.py --demo (no network needed).
- No API keys or secrets in any file.
