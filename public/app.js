/* World Globe (UI): a dark 3D globe (vendor/globe.gl) with the most important world news pinned where it happens, and a ranked feed
 * beside it. Data: server.py /api/world (RSS, polled every 5 min while the tab is visible); placing, grouping and ranking: geo.js
 * (keyword rules, not understanding). Hovering a story flies the globe there; clicking one pins it (the only pin on the globe) and opens its card.
 * Performance: the DOM is only rebuilt when the news or a filter changes (setHTML / setText skip unchanged content), the globe's data only
 * when the lit countries or the selected story change, and the globe stops rendering while the tab is hidden. */
(function () {
'use strict';
var G = window.Geo, root = document.getElementById('app'); if (!G || !root) return;
var COL = {war: '#ff3b5c', energy: '#ffb020', macro: '#3da5ff', ai: '#b26bff', markets: '#19ffb0', disaster: '#f5e663', politics: '#c9d4e6', other: '#7f93b5'};
var WINS = [['24h', 24], ['3d', 72], ['7d', 168]], POLL = 5 * 60e3, MAXLIT = 120, MAXFEED = 60;
var VIDEO_CATS = {war: 1}; // topics whose stories play a matching news-channel video under the card
function vidOf(s) { return s && s.video && VIDEO_CATS[s.cat] ? s.video : null; }
var cat = 'all', win = 0, sel = null, raw = null, all = [], shown = [], fetchedAt = 0, errors = {}, srcs = [], loading = false, failed = '', demo = false;
var glb = null, countries = null, countryOf = null, booting = false, spin = true, hoverT = 0;
try { var c0 = localStorage.getItem('wg_cat'); if (c0 && (c0 === 'all' || COL[c0])) cat = c0; var w0 = +localStorage.getItem('wg_win'); if (w0 >= 0 && w0 < WINS.length) win = w0; } catch (e) {}
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
function setText(el, t) { t = String(t); if (el && el.textContent !== t) el.textContent = t; }
function setHTML(el, h) { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } }
function ago(t) { var m = Math.max(0, Math.round((Date.now() - t) / 60e3)); return m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }
function hhmm(t) { return new Date(t).toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit'}); }
function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }

root.innerHTML = '<header class="wbar"><div class="brand"><i class="logo"></i><b>WORLD GLOBE</b><span class="muted wsub">the most important news, pinned where it happens</span></div>' +
  '<div class="wclock" id="w-clock" title="Coordinated Universal Time"></div><span class="wstat muted" id="w-stat">loading…</span>' +
  '<button class="wref" id="w-ref" title="Load the latest news again">↻ Refresh</button></header>' +
  '<nav class="wfilters"><div class="wcats" id="w-cats"></div><div class="wwin" id="w-win">' + WINS.map(function (w, k) { return '<button data-w="' + k + '">' + w[0] + '</button>'; }).join('') + '</div></nav>' +
  '<main class="wbody"><section class="wglobe" id="w-box" aria-label="Globe"><div id="w-globe"></div><div class="wload" id="w-load">loading globe…</div>' +
  '<div class="wleft"><div class="wcard" id="w-card" hidden></div><div class="wvid" id="w-vid" hidden></div></div>' +
  '<div class="wlegend"><span><i class="lc"></i>lit country = in the news</span><span><i class="lp"></i>select a story to pin it</span><span><i class="la"></i>arc = a second place the story names</span></div>' +
  '<button class="wspin on" id="w-spin" title="Rotate the globe slowly">Auto-rotate</button></section>' +
  '<aside class="wfeed"><div class="wfh"><span>TOP STORIES</span><span class="muted" id="w-n"></span></div><div class="wlist" id="w-list"><div class="wempty">Loading the news…</div></div>' +
  '<div class="wfoot muted">Places, groups and ranks headlines by keyword rules, not by reading them: a pin can be wrong. Ranking = topic weight × number of outlets × recency. Market angles are rules of thumb, not advice.</div></aside></main>';
function clock() { var d = new Date(); setText($('w-clock'), d.toISOString().slice(11, 16) + ' UTC'); }
clock(); setInterval(clock, 15e3);

/* ---------- data ---------- */
function load(force) {
  if (loading) return; loading = true;
  get(feed, force).catch(function (e) { // no /api/world here (the GitHub Pages copy): read the news file the scheduled build wrote
    if (feed !== '/api/world') throw e; feed = 'data/world.json'; return get(feed, force);
  }).then(function (d) {
    raw = d.headlines || []; demo = !!d.demo; errors = d.errors || {}; srcs = d.sources || []; fetchedAt = d.fetchedAt || Date.now(); failed = ''; rebuild();
  }).catch(function (e) { failed = e.message; if (!raw) fetchedAt = Date.now(); paintStatus(); }).then(function () { loading = false; });
}
var feed = '/api/world'; // server.py; falls back to data/world.json for the static site
function get(url, force) {
  return fetch(url + (force ? '?t=' + Date.now() : ''), {cache: 'no-store'}).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
}
function rebuild() { if (!raw) return; all = G.stories(raw, Date.now(), {countryOf: countryOf}); render(); }
function filtered() {
  var since = Date.now() - WINS[win][1] * 3600e3;
  return all.filter(function (s) { return s.at >= since && (cat === 'all' || s.cat === cat); });
}

/* ---------- bar, feed, card ---------- */
function paintCats() {
  var since = Date.now() - WINS[win][1] * 3600e3, n = {all: 0};
  all.forEach(function (s) { if (s.at >= since) { n.all++; n[s.cat] = (n[s.cat] || 0) + 1; } });
  var keys = ['all'].concat(G.CATS);
  setHTML($('w-cats'), keys.map(function (k) {
    var lab = k === 'all' ? 'All' : G.CAT_INFO[k].label;
    return '<button data-c="' + k + '" class="' + (k === cat ? 'on' : '') + '" style="--c:' + (COL[k] || '#00e5ff') + '">' + (k === 'all' ? '' : '<i></i>') + esc(lab) + ' <em>' + (n[k] || 0) + '</em></button>';
  }).join(''));
  Array.prototype.forEach.call($('w-win').children, function (b) { b.classList.toggle('on', +b.getAttribute('data-w') === win); });
}
function paintStatus() {
  var bad = Object.keys(errors), h;
  if (failed && !raw) h = 'could not load the news (' + failed + ')';
  else if (raw && !raw.length) h = 'no headlines: ' + (bad.length ? 'every feed failed (' + bad.join(', ') + '); check your internet connection' : 'the feeds came back empty');
  else h = (demo ? 'DEMO headlines · ' : '') + 'updated ' + hhmm(fetchedAt) + ' · ' + raw.length + ' headlines from ' + (srcs.length - bad.length) + ' outlets' + (bad.length ? ' · failed: ' + bad.join(', ') : '');
  setText($('w-stat'), raw ? h : failed ? h : 'loading…');
}
function placeHTML(s) {
  if (!s.place) return '<span class="wplace none" title="No place named that the gazetteer knows: not on the globe">not on the map</span>';
  return '<span class="wplace ' + s.place.conf + '" title="' + (s.place.conf === 'spot' ? 'Exact place named in the story' : 'Only a country was named: pinned at its centre') + '">◉ ' + esc(s.place.label) + (s.place.conf === 'country' ? ' <em>country</em>' : '') + '</span>';
}
function itemHTML(s, i) {
  return '<div class="witem' + (s.id === sel ? ' on' : '') + '" data-id="' + s.id + '" style="--c:' + COL[s.cat] + '">' +
    '<div class="wi1"><span class="wrank">' + (i + 1) + '</span><span class="wcat">' + esc(G.CAT_INFO[s.cat].label) + '</span>' + (vidOf(s) ? '<span class="wvbadge" title="A news video plays when you open this story">▶ video</span>' : '') + '<span class="wage">' + ago(s.at) + '</span></div>' +
    '<div class="wtitle">' + esc(s.title) + '</div>' +
    '<div class="wi2">' + placeHTML(s) + '<span class="wsrc" title="' + esc(s.sources.join(', ')) + '">' + s.sources.length + ' outlet' + (s.sources.length === 1 ? '' : 's') + '</span></div>' +
    (s.impact ? '<div class="wimp">▸ ' + esc(s.impact) + '</div>' : '') + '</div>';
}
function render() {
  shown = filtered(); paintCats(); paintStatus();
  setText($('w-n'), shown.length + ' stor' + (shown.length === 1 ? 'y' : 'ies') + ' · ' + shown.filter(function (s) { return s.place; }).length + ' on the map');
  setHTML($('w-list'), shown.length ? shown.slice(0, MAXFEED).map(itemHTML).join('') : '<div class="wempty">' + (raw ? 'No stories in this filter and time window.' : 'Loading the news…') + '</div>');
  if (sel && !shown.some(function (s) { return s.id === sel; })) close();
  paintGlobe(); paintCard();
}
function byId(id) { for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
function paintCard() {
  var s = sel && byId(sel), el = $('w-card');
  paintVideo(vidOf(s));
  if (!s) { el.hidden = true; return; }
  el.hidden = false; el.style.setProperty('--c', COL[s.cat]);
  var links = s.items.slice(0, 8).map(function (x) {
    var u = /^https:\/\//.test(x.url || '') ? x.url : '';
    return '<li><b>' + (x.video ? '▶ ' : '') + esc(x.source) + '</b> <span class="muted">' + ago(x.at) + ' ago</span> ' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + '</a>' : esc(x.title)) + '</li>';
  }).join('');
  var where = s.place ? esc(s.place.label) + ' · ' + (s.place.conf === 'spot' ? 'exact place' : 'country level, no exact place named') + (s.place.all.length > 1 ? '<br><span class="muted">also named: ' + esc(s.place.all.slice(1, 5).join(', ')) + '</span>' : '') : 'not on the map: no known place named';
  setHTML(el, '<div class="wch"><span class="wcat">' + esc(G.CAT_INFO[s.cat].label) + '</span><span class="muted">' + ago(s.at) + ' ago · ' + s.sources.length + ' outlet' + (s.sources.length === 1 ? '' : 's') + '</span><button class="x" id="w-x" aria-label="Close">×</button></div>' +
    '<div class="wct">' + esc(s.title) + '</div>' + (s.summary ? '<div class="wcs">' + esc(s.summary) + '</div>' : '') +
    '<div class="wcw"><span>WHERE</span>' + where + '</div>' +
    (s.impact ? '<div class="wcw imp"><span>MARKET ANGLE</span>' + esc(s.impact) + ' <em class="muted">(rule of thumb)</em></div>' : '') +
    '<ul class="wcl">' + links + '</ul>');
}
// the player only depends on the video id, so the 60 s refresh of the card never restarts it; closing the card removes it (stops playback)
function paintVideo(v) {
  var el = $('w-vid'); el.hidden = !v;
  setHTML(el, v ? '<div class="wvh"><span>▶ VIDEO · ' + esc(v.source) + ' · ' + ago(v.at) + ' ago</span><a href="https://www.youtube.com/watch?v=' + v.id + '" target="_blank" rel="noopener noreferrer">Open on YouTube</a></div>' +
    '<div class="wframe"><iframe src="https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&amp;mute=1&amp;playsinline=1&amp;rel=0" title="' + esc(v.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' : '');
}
function select(id, fly) {
  sel = id; var s = byId(id);
  Array.prototype.forEach.call($('w-list').querySelectorAll('.witem'), function (el) { el.classList.toggle('on', el.getAttribute('data-id') === id); });
  paintCard(); if (glb) { paintSel(); if (s && s.place && fly !== false) flyTo(s, 1.5); setSpin(false); }
  var it = $('w-list').querySelector('.witem[data-id="' + id + '"]'); if (it && fly === false) it.scrollIntoView({block: 'nearest', behavior: 'smooth'});
}
function close() { sel = null; $('w-card').hidden = true; paintVideo(null); Array.prototype.forEach.call($('w-list').querySelectorAll('.witem.on'), function (el) { el.classList.remove('on'); }); if (glb) paintSel(); }

$('w-cats').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cat = b.getAttribute('data-c'); try { localStorage.setItem('wg_cat', cat); } catch (x) {} render(); });
$('w-win').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; win = +b.getAttribute('data-w'); try { localStorage.setItem('wg_win', win); } catch (x) {} render(); });
$('w-ref').addEventListener('click', function () { load(true); });
$('w-list').addEventListener('click', function (e) { var it = e.target.closest('.witem'); if (it) select(it.getAttribute('data-id')); });
$('w-list').addEventListener('mouseover', function (e) {
  var it = e.target.closest('.witem'); if (!it || !glb || sel) return; clearTimeout(hoverT);
  hoverT = setTimeout(function () { var s = byId(it.getAttribute('data-id')); if (s && s.place) { flyTo(s, 2.0); setSpin(false); } }, 260);
});
$('w-list').addEventListener('mouseleave', function () { clearTimeout(hoverT); });
$('w-card').addEventListener('click', function (e) { if (e.target.closest('#w-x')) close(); });
$('w-spin').addEventListener('click', function () { setSpin(!spin); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sel) close(); });

/* ---------- globe ---------- */
function setSpin(v) { spin = v; $('w-spin').classList.toggle('on', v); if (glb) glb.controls().autoRotate = v; }
function flyTo(s, alt) { glb.pointOfView({lat: s.place.lat, lng: s.place.lon, altitude: alt}, 1100); }
function boot() {
  if (glb || booting) return; booting = true;
  var sc = document.createElement('script'); sc.src = 'vendor/globe.gl.min.js';
  var geo = fetch('vendor/countries.geojson').then(function (r) { return r.json(); });
  sc.onload = function () {
    geo.then(function (fc) {
      countries = fc.features.filter(function (f) { return f.properties.name !== 'Antarctica'; }); countryOf = G.countryLookup(fc.features);
      var el = $('w-globe'), box = $('w-box');
      glb = new window.Globe(el, {rendererConfig: {antialias: true, alpha: true}})
        .backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#00e5ff').atmosphereAltitude(0.2).showGraticules(true)
        .width(box.clientWidth).height(box.clientHeight)
        .polygonsData(countries).polygonAltitude(0.006).polygonSideColor(function () { return 'rgba(0,229,255,0.04)'; }).polygonStrokeColor(function () { return 'rgba(0,229,255,0.28)'; })
        .polygonsTransitionDuration(400).polygonLabel(function (f) { return '<div class="wtip"><b>' + esc(f.properties.name) + '</b></div>'; })
        .pointLat(function (s) { return s.place.lat; }).pointLng(function (s) { return s.place.lon; }).pointRadius(0.5).pointColor(function (s) { return COL[s.cat]; })
        .pointAltitude(function (s) { return 0.02 + Math.min(0.3, s.score * 0.12); }).pointsMerge(false).pointsTransitionDuration(500)
        .pointLabel(function (s) { return '<div class="wtip" style="--c:' + COL[s.cat] + '"><span>' + esc(G.CAT_INFO[s.cat].label) + ' · ' + esc(s.place.label) + '</span><b>' + esc(s.title) + '</b><em>' + ago(s.at) + ' ago · ' + s.sources.length + ' outlet' + (s.sources.length === 1 ? '' : 's') + '</em></div>'; })
        .onPointClick(function (s) { select(s.id, false); })
        .ringLat(function (s) { return s.place.lat; }).ringLng(function (s) { return s.place.lon; }).ringMaxRadius(4.5).ringPropagationSpeed(1.6).ringRepeatPeriod(1400)
        .ringColor(function (s) { var c = COL[s.cat]; return function (t) { return rgba(c, 1 - t); }; })
        .arcStartLat(function (s) { return s.place.to.lat; }).arcStartLng(function (s) { return s.place.to.lon; }).arcEndLat(function (s) { return s.place.lat; }).arcEndLng(function (s) { return s.place.lon; })
        .arcColor(function (s) { return [rgba(COL[s.cat], 0.15), rgba(COL[s.cat], 0.9)]; }).arcStroke(0.45).arcDashLength(0.45).arcDashGap(0.25).arcDashAnimateTime(2600).arcAltitudeAutoScale(0.35)
        .labelLat(function (s) { return s.place.lat; }).labelLng(function (s) { return s.place.lon; }).labelText(function (s) { return s.place.label; }).labelSize(0.55).labelDotRadius(0)
        .labelColor(function () { return 'rgba(232,246,255,0.85)'; }).labelAltitude(0.012).labelResolution(2)
        .onGlobeClick(function () { if (sel) close(); });
      var m = glb.globeMaterial(); m.color.set('#050d1f'); if (m.emissive) m.emissive.set('#02060f'); if ('shininess' in m) m.shininess = 4;
      var ctl = glb.controls(); ctl.autoRotate = spin; ctl.autoRotateSpeed = 0.35; ctl.enableDamping = true; ctl.minDistance = 130; ctl.maxDistance = 700;
      ctl.addEventListener('start', function () { if (spin) setSpin(false); });
      glb.pointOfView({lat: 28, lng: 40, altitude: box.clientWidth < 600 ? 2.7 : 1.9}); // a narrow screen needs the camera further out to fit the globe
      new ResizeObserver(function () { if (box.clientWidth && box.clientHeight) glb.width(box.clientWidth).height(box.clientHeight); }).observe(box);
      $('w-load').hidden = true; rebuild(); visible();
    });
  };
  sc.onerror = function () { setText($('w-load'), 'could not load the globe (vendor/globe.gl.min.js)'); };
  document.head.appendChild(sc);
}
var sigLit = '', sigSel = null;
function paintGlobe() { // the globe stays clean: countries in the news are lit, and only the selected story gets a pin
  if (!glb) return;
  var placed = shown.filter(function (s) { return s.place; }).slice(0, MAXLIT), sig = placed.map(function (s) { return s.id; }).join(',');
  if (sig !== sigLit) { // data changes only when the news or the filters change, never per frame
    sigLit = sig;
    var lit = {}; placed.forEach(function (s) { s.place.maps.forEach(function (m) { if (!lit[m]) lit[m] = s; }); });
    glb.polygonCapColor(function (f) { var s = lit[f.properties.name]; return s ? rgba(COL[s.cat], 0.2) : 'rgba(12,28,58,0.78)'; })
      .polygonStrokeColor(function (f) { var s = lit[f.properties.name]; return s ? rgba(COL[s.cat], 0.75) : 'rgba(0,229,255,0.22)'; });
  }
  paintSel();
}
function paintSel() {
  if (!glb) return;
  var s = sel && byId(sel), one = s && s.place ? [s] : [], id = one.length ? s.id : '';
  if (id === sigSel) return; sigSel = id;
  glb.pointsData(one).ringsData(one).labelsData(one).arcsData(one.filter(function (x) { return x.place.to && G.dist(x.place, x.place.to) > 700; }));
}

/* ---------- tab visible / hidden ---------- */
var timer = 0;
function visible() {
  var v = !document.hidden;
  if (v) { boot(); if (!raw || Date.now() - fetchedAt > POLL) load(); }
  if (glb) { if (v) glb.resumeAnimation(); else glb.pauseAnimation(); }
  clearInterval(timer); if (v) timer = setInterval(function () { if (Date.now() - fetchedAt > POLL) load(); else render(); }, 60e3); // ages and ranks drift with time
}
document.addEventListener('visibilitychange', visible);
visible();
window.World = {get stories() { return all; }, get shown() { return shown; }, select: select, reload: function () { load(true); }};
})();
