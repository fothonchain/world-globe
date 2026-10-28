// node test/cal.test.js : calendar events (public/cal.js)
const assert = require('assert'), C = require('../public/cal.js');
let n = 0; function t(name, fn) { fn(); n++; console.log('ok -', name); }
const NOW = Date.parse('2026-10-26T12:00:00Z'), H = 3600e3;

t('schedule dates parse to the right instants (ET, daylight saving)', () => {
  assert.equal(new Date(C.SCHEDULE[0].at).toISOString(), '2026-10-28T18:00:00.000Z');
  assert.equal(new Date(C.SCHEDULE.find(e => /November data/.test(e.title)).at).toISOString(), '2026-12-10T13:30:00.000Z');
  assert(C.SCHEDULE.every(e => isFinite(e.at)));
});
t('kindOf: rate decisions, pressers, speeches, data', () => {
  assert.equal(C.kindOf('Federal Funds Rate'), 'rate'); assert.equal(C.kindOf('Main Refinancing Rate'), 'rate'); assert.equal(C.kindOf('BOJ Policy Rate'), 'rate');
  assert.equal(C.kindOf('FOMC Press Conference'), 'presser'); assert.equal(C.kindOf('Fed Chair Powell Speaks'), 'speech');
  assert.equal(C.kindOf('Core CPI m/m'), 'cpi'); assert.equal(C.kindOf('Non-Farm Employment Change'), 'jobs'); assert.equal(C.kindOf('Advance GDP q/q'), 'gdp');
  assert.equal(C.kindOf('Crude Oil Inventories'), 'other');
});
t('build: the live feed replaces the scheduled entry; minor currencies and low impact are dropped', () => {
  const feed = [{title: 'Federal Funds Rate', country: 'USD', impact: 'High', at: Date.parse('2026-10-28T18:00:00Z'), forecast: '4.25%', previous: '4.50%'},
    {title: 'Selic Rate', country: 'BRL', impact: 'High', at: NOW}, {title: 'Housing Starts', country: 'USD', impact: 'Medium', at: NOW + H}];
  const ev = C.build(feed, NOW), fomc = ev.filter(e => e.kind === 'rate' && e.country === 'USD' && Math.abs(e.at - Date.parse('2026-10-28T18:00:00Z')) < H);
  assert.equal(fomc.length, 1); assert.equal(fomc[0].src, 'live'); assert.equal(fomc[0].forecast, '4.25%');
  assert(!ev.some(e => e.country === 'BRL')); assert(!ev.some(e => e.title === 'Housing Starts'));
  assert(C.build(feed, NOW, {minImpact: 'Medium'}).some(e => e.title === 'Housing Starts'));
  for (let i = 1; i < ev.length; i++) assert(ev[i].at >= ev[i - 1].at);
});
t('build: place, streams (official first for central-bank events), why', () => {
  const ev = C.build([{title: 'Federal Funds Rate', country: 'USD', impact: 'High', at: NOW + H}, {title: 'CPI m/m', country: 'USD', impact: 'High', at: NOW + 2 * H},
    {title: 'Main Refinancing Rate', country: 'EUR', impact: 'High', at: NOW + 3 * H}], NOW);
  const fed = ev.find(e => e.kind === 'rate' && e.country === 'USD'), cpi = ev.find(e => e.kind === 'cpi'), ecb = ev.find(e => e.country === 'EUR');
  assert.equal(fed.place.label, 'Federal Reserve, Washington'); assert.equal(fed.streams[0], 'fed'); assert(/US rates/.test(fed.why));
  assert.equal(cpi.streams[0], 'cnbc'); assert(!cpi.streams.includes('fed'));
  assert.equal(ecb.place.label, 'ECB, Frankfurt'); assert.equal(ecb.streams[0], 'ecb');
  assert.notEqual(fed.id, cpi.id);
});
t('status: upcoming / soon / live window / done; old events dropped', () => {
  const e = {kind: 'rate', at: NOW};
  assert.equal(C.status(e, NOW - 2 * H), 'upcoming'); assert.equal(C.status(e, NOW - 30 * 60e3), 'soon'); assert.equal(C.status(e, NOW - 10 * 60e3), 'live');
  assert.equal(C.status(e, NOW + 80 * 60e3), 'live'); assert.equal(C.status(e, NOW + 100 * 60e3), 'done');
  assert.equal(C.status({kind: 'cpi', at: NOW}, NOW + 40 * 60e3), 'done');
  assert.equal(C.build([{title: 'CPI m/m', country: 'USD', impact: 'High', at: NOW - 20 * H}], NOW).filter(x => x.title === 'CPI m/m').length, 0);
  assert.equal(C.countdown(3 * H + 20 * 60e3), '3h 20m'); assert.equal(C.countdown(50 * H), '2d 2h');
});
t('pickStream: only valid channel / video ids', () => {
  const e = C.build([{title: 'Federal Funds Rate', country: 'USD', impact: 'High', at: NOW}], NOW).find(x => x.kind === 'rate');
  const p = C.pickStream(e, {fed: {id: 'UCabcdefghijklmnopqrstuv', latest: {id: 'abcDEF12345'}}, cnbc: {id: 'bad'}, bloomberg: {id: 'UCabcdefghijklmnopqrstuw'}}, NOW);
  assert.deepEqual(p.live, ['fed', 'bloomberg']); assert.deepEqual(p.latest, ['fed']); assert.equal(p.status, 'live');
});
console.log(n + ' tests passed');
