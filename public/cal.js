/* World Globe calendar: important meetings and data releases (FOMC, CPI, jobs, ECB, BoE, BoJ...). Pure logic: browser window.Cal /
 * node module.exports. Data: server.py /api/world -> calendar (this week's economic calendar, faireconomy / ForexFactory JSON) and
 * channels (official and finance-TV YouTube channels, for live streams).
 * - The weekly feed has no next week, so FOMC decisions and US CPI releases further out come from SCHEDULE (dates published by the
 *   Fed and the BLS; checked 2026-10-10; BLS had not published 2027 CPI dates). Extend it yearly. The live feed wins for the same event.
 * - Each event gets a kind, a place on the globe (the central bank / capital of its currency), a status (upcoming / soon / live / done)
 *   and the live streams worth trying, best first. */
(function (root) {
'use strict';
var SCHEDULE = [
  ['FOMC rate decision', 'USD', '2026-10-28T14:00:00-04:00'], ['FOMC rate decision', 'USD', '2026-12-09T14:00:00-05:00'],
  ['FOMC rate decision (tentative)', 'USD', '2027-01-27T14:00:00-05:00'], ['FOMC rate decision (tentative)', 'USD', '2027-03-17T14:00:00-04:00'],
  ['FOMC rate decision (tentative)', 'USD', '2027-04-28T14:00:00-04:00'], ['FOMC rate decision (tentative)', 'USD', '2027-06-09T14:00:00-04:00'],
  ['FOMC rate decision (tentative)', 'USD', '2027-07-28T14:00:00-04:00'], ['FOMC rate decision (tentative)', 'USD', '2027-09-15T14:00:00-04:00'],
  ['FOMC rate decision (tentative)', 'USD', '2027-10-27T14:00:00-04:00'], ['FOMC rate decision (tentative)', 'USD', '2027-12-08T14:00:00-05:00'],
  ['CPI (October data)', 'USD', '2026-11-10T08:30:00-05:00'], ['CPI (November data)', 'USD', '2026-12-10T08:30:00-05:00']
].map(function (x) { return {title: x[0], country: x[1], at: Date.parse(x[2]), impact: 'High', src: 'schedule'}; });

// [kind, label shown, pattern, central-bank event?]
var KINDS = [
  ['rate', 'Rate decision', /federal funds rate|fomc statement|rate decision|interest rate|cash rate|bank rate|main refinancing|deposit facility|policy rate|monetary policy statement|official bank rate|overnight rate|loan prime rate/i, true],
  ['presser', 'Press conference', /press conference/i, true],
  ['minutes', 'Meeting minutes', /minutes|monetary policy summary|meeting accounts/i, true],
  ['speech', 'Central banker speaks', /speaks|testifies|testimony|\bpowell\b|lagarde|bailey|\bueda\b/i, true],
  ['cpi', 'Inflation (CPI)', /\bcpi\b|consumer price|inflation rate|\bhicp\b/i, false],
  ['pce', 'Inflation (PCE)', /\bpce\b/i, false],
  ['ppi', 'Producer prices (PPI)', /\bppi\b|producer price/i, false],
  ['jobs', 'Jobs', /non-farm|nonfarm|unemployment|employment change|claimant count|jobless|jolts|payrolls/i, false],
  ['gdp', 'GDP', /\bgdp\b/i, false],
  ['retail', 'Retail sales', /retail sales/i, false],
  ['pmi', 'PMI', /\bpmi\b|ism /i, false]
];
var KIND_INFO = {}; KINDS.forEach(function (k) { KIND_INFO[k[0]] = {key: k[0], label: k[1], bank: k[3]}; }); KIND_INFO.other = {key: 'other', label: 'Release', bank: false};
function kindOf(title) { for (var i = 0; i < KINDS.length; i++) if (KINDS[i][2].test(title || '')) return KINDS[i][0]; return 'other'; }

// currency -> who decides and where it is on the globe; streams: channel keys (server.py CHANNELS) best first
var CUR = {
  USD: {bank: 'Federal Reserve', country: 'United States', label: 'Federal Reserve, Washington', lat: 38.89, lon: -77.05, map: 'United States of America', official: 'fed', tv: ['cnbc', 'bloomberg', 'yahoo']},
  EUR: {bank: 'European Central Bank', country: 'Euro area', label: 'ECB, Frankfurt', lat: 50.11, lon: 8.7, map: 'Germany', official: 'ecb', tv: ['bloomberg', 'cnbc']},
  GBP: {bank: 'Bank of England', country: 'United Kingdom', label: 'Bank of England, London', lat: 51.51, lon: -0.09, map: 'United Kingdom', official: 'boe', tv: ['bloomberg', 'cnbc']},
  JPY: {bank: 'Bank of Japan', country: 'Japan', label: 'Bank of Japan, Tokyo', lat: 35.69, lon: 139.77, map: 'Japan', official: '', tv: ['bloomberg']},
  CNY: {bank: "People's Bank of China", country: 'China', label: 'PBOC, Beijing', lat: 39.91, lon: 116.37, map: 'China', official: '', tv: ['bloomberg']},
  CAD: {bank: 'Bank of Canada', country: 'Canada', label: 'Bank of Canada, Ottawa', lat: 45.42, lon: -75.7, map: 'Canada', official: '', tv: ['bloomberg']},
  AUD: {bank: 'Reserve Bank of Australia', country: 'Australia', label: 'RBA, Sydney', lat: -33.87, lon: 151.21, map: 'Australia', official: '', tv: ['bloomberg']},
  NZD: {bank: 'Reserve Bank of New Zealand', country: 'New Zealand', label: 'RBNZ, Wellington', lat: -41.29, lon: 174.78, map: 'New Zealand', official: '', tv: ['bloomberg']},
  CHF: {bank: 'Swiss National Bank', country: 'Switzerland', label: 'SNB, Zurich', lat: 47.37, lon: 8.54, map: 'Switzerland', official: '', tv: ['bloomberg']}
};

// how long an event stays "live" after its time (a rate decision is followed by a press conference)
function liveFor(e) { return (e.kind === 'rate' || e.kind === 'presser' || e.kind === 'speech') ? 90 * 60e3 : 30 * 60e3; }
function status(e, now) {
  var d = e.at - now;
  if (d > 60 * 60e3) return 'upcoming';
  if (d > 15 * 60e3) return 'soon';
  if (d > -liveFor(e)) return 'live'; // from 15 min before until the window ends
  return 'done';
}
function countdown(ms) {
  var a = Math.abs(ms), m = Math.round(a / 60e3), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d >= 1 ? d + 'd ' + (h % 24) + 'h' : h >= 1 ? h + 'h ' + (m % 60) + 'm' : m + 'm';
}
function why(e) {
  var c = e.country;
  if (e.kind === 'rate' || e.kind === 'presser') return c === 'USD' ? 'US rates: USD, yields, stocks, BTC volatility' : c === 'JPY' ? 'Yen / carry trade: global risk appetite' : c + ' rates and currency';
  if (e.kind === 'speech') return 'Hints on the next rate move: ' + c + ' and yields';
  if (e.kind === 'minutes') return 'How split the bank is: ' + c + ' rate expectations';
  if (e.kind === 'cpi' || e.kind === 'pce' || e.kind === 'ppi') return 'Inflation: rate-cut odds, ' + c + ', ' + (c === 'USD' ? 'yields, BTC' : 'local stocks');
  if (e.kind === 'jobs') return 'Labour market: rate expectations, ' + c;
  if (e.kind === 'gdp') return 'Growth: recession odds, ' + c;
  return c + ' volatility around the release';
}
function idOf(e) { var s = e.country + '|' + e.title + '|' + e.at, x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return 'e' + (x >>> 0).toString(36); }

// raw weekly calendar [{title, country, impact, at, forecast, previous}] + schedule -> events, oldest first
// opt.minImpact: 'High' (default) or 'Medium'; past events older than opt.keepDoneH hours are dropped (default 12)
function build(feed, now, opt) {
  opt = opt || {};
  var keepDone = (opt.keepDoneH == null ? 12 : opt.keepDoneH) * 3600e3, med = opt.minImpact === 'Medium';
  var live = (feed || []).filter(function (e) { return e && CUR[e.country] && isFinite(e.at) && (e.impact === 'High' || (med && e.impact === 'Medium')); })
    .map(function (e) { return {title: String(e.title || ''), country: e.country, at: e.at, impact: e.impact, forecast: e.forecast || '', previous: e.previous || '', src: 'live'}; });
  var sched = SCHEDULE.filter(function (s) { // the feed wins for the same kind and currency within 12 h
    return !live.some(function (e) { return e.country === s.country && kindOf(e.title) === kindOf(s.title) && Math.abs(e.at - s.at) < 12 * 3600e3; });
  });
  return live.concat(sched).filter(function (e) { return e.at >= now - keepDone; }).map(function (e) {
    var k = kindOf(e.title), cur = CUR[e.country], info = KIND_INFO[k];
    var streams = info.bank && cur.official ? [cur.official].concat(cur.tv) : cur.tv.slice();
    var ev = {id: '', title: e.title, country: e.country, at: e.at, impact: e.impact, forecast: e.forecast || '', previous: e.previous || '', src: e.src,
      kind: k, kindLabel: info.label, bank: cur.bank, central: info.bank, streams: streams,
      place: {label: cur.label, lat: cur.lat, lon: cur.lon, conf: 'spot', map: cur.map, to: null, all: [cur.label], maps: [cur.map]}};
    ev.id = idOf(ev); ev.why = why(ev);
    return ev;
  }).sort(function (a, b) { return a.at - b.at; });
}
// the first stream whose channel is known; live first when the event is live, else the official channel's latest video if any
function pickStream(e, channels, now) {
  var ch = channels || {}, ok = e.streams.filter(function (k) { return ch[k] && /^UC[A-Za-z0-9_-]{22}$/.test(ch[k].id || ''); });
  return {live: ok, latest: ok.filter(function (k) { return ch[k].latest && /^[A-Za-z0-9_-]{11}$/.test(ch[k].latest.id || ''); }), status: status(e, now)};
}

var Cal = {SCHEDULE: SCHEDULE, CUR: CUR, KIND_INFO: KIND_INFO, kindOf: kindOf, status: status, countdown: countdown, build: build, pickStream: pickStream, why: why};
if (typeof module !== 'undefined' && module.exports) module.exports = Cal; else root.Cal = Cal;
})(typeof window !== 'undefined' ? window : this);
