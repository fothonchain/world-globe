# World Globe

A dark 3D globe with the most important world news (war, energy and shipping, central banks and the economy, AI and tech, markets, disasters, politics) pinned to where each story happens, with a ranked feed beside it. The aim is to stay informed at a glance.

![World Globe](docs/screenshot.png)

## Run it

```bash
python3 server.py            # http://127.0.0.1:8770/
python3 server.py 9000       # another port
python3 server.py --demo     # made-up headlines from test/demo_headlines.json (works offline)
python3 server.py --lan      # also reachable from other devices on your network
```

You need only Python 3 and a modern browser: no installs, no build step and no API keys. The server is needed because browsers can't read news RSS feeds directly (CORS). It fetches the feeds and serves the page.

## How it works

| Piece | File | What it does |
|---|---|---|
| Feeds | `server.py` | Fetches BBC World and Business, Al Jazeera, Guardian World, NPR World, France 24, CNBC World and TechCrunch AI RSS in parallel. Each feed is cached for 10 minutes, and a failed feed keeps its last good copy. `GET /api/world` returns the newest 300 headlines. |
| Placing and ranking | `public/geo.js` | Pure logic that runs in the browser and in Node. See the rules below. |
| Globe and feed | `public/app.js` | [globe.gl](https://github.com/vasturiano/globe.gl) (stored in the repo under `public/vendor/`), Natural Earth country outlines, the ranked feed, filters and story cards. |

**Placing a story.** The headline and summary are matched against a hand-made list of places. A precise place (Strait of Hormuz, Kyiv, Gaza, Taiwan Strait) wins over an institution (Fed, ECB, OPEC, Nvidia HQ). An institution wins over a country, which is pinned at its centre and labelled "country". A country wins over a leader (Trump goes to the White House, Putin to the Kremlin). A second place, if one is named, becomes an arc. Stories with no known place stay in the feed as "not on the map".

**Ranking.** Topic weight × (1 + 0.6 per extra outlet covering the same story, up to 5) × 0.5^(age / 12 h). The same story from several outlets is merged by word overlap.

**Market angle.** A fixed rule of thumb per topic and region (for example "Oil supply risk: crude up, risk-off"). It is not advice and not a forecast.

**Limits.** This is keyword matching, not understanding. A place that is only mentioned in passing can get the pin, and the same story worded very differently can show up twice. The page says this too.

## Using it

- Topic buttons and the 24h / 3d / 7d window filter both the feed and the globe. Both choices are remembered.
- Hovering a story flies the globe to it. Clicking a story or a pin opens its card: every outlet's link, the place and how sure the placement is, and the market angle. Press Esc to close the card.
- Pin height shows importance. The top 5 stories pulse. Countries in the news light up in their story's colour.
- The page refreshes every 5 minutes while the tab is visible. The globe stops rendering while the tab is hidden.

## Tests

```bash
node test/geo.test.js        # placing, country lookup, categories, grouping, recency
python3 test/server_test.py  # RSS parsing + demo feed (no network)
```

## Adding places

Add an entry to `GAZ` (exact spots, institutions, leaders) or `COUNTRIES` in `public/geo.js`, then add a case to `test/geo.test.js`. Levels: 3 = exact spot, 2.5 = institution / company HQ, 2 = country, 1.5 = leader or seat of government.

## Licences

globe.gl and three.js: MIT. Country outlines: Natural Earth via world-atlas (public domain). Headlines and links belong to their publishers. The app shows titles and short summaries and links to the original articles.
