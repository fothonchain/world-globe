// node test/geo.test.js : World page news placing, grouping, ranking (geo.js)
const assert = require('assert'), fs = require('fs'), G = require('../public/geo.js');
let n = 0; function t(name, fn) { fn(); n++; console.log('ok -', name); }
const cof = G.countryLookup(JSON.parse(fs.readFileSync(__dirname + '/../public/vendor/countries.geojson')).features);
const NOW = Date.parse('2026-10-26T12:00:00Z'), H = 3600e3;

t('locate: an exact spot beats the country; the country becomes the second place', () => {
  const l = G.locate('Iran threatens to close Strait of Hormuz after tanker seizure', '', cof);
  assert.equal(l.label, 'Strait of Hormuz'); assert.equal(l.conf, 'spot'); assert.equal(l.to.label, 'Iran');
  const k = G.locate('Russia launches massive drone attack on Kyiv', '', cof); assert.equal(k.label, 'Kyiv'); assert.equal(k.to.label, 'Russia');
});
t('locate: a country drops out when a spot inside it was named (Tehran, then Iran)', () => {
  const l = G.locate('Tehran says Iran will respond', '', cof); assert.equal(l.label, 'Tehran'); assert.equal(l.to, null);
});
t('locate: institutions beat leaders, countries beat leaders, title beats summary, nothing named -> null', () => {
  assert.equal(G.locate('Trump pressures the Fed to cut rates', '', cof).label, 'Federal Reserve');
  assert.equal(G.locate('Trump says Iran must stop enrichment', '', cof).label, 'Iran');
  assert.equal(G.locate('Talks resume in Egypt', 'Officials from Qatar attended', cof).label, 'Egypt');
  assert.equal(G.locate('Oil prices climb', '', cof), null);
  assert.equal(G.locate('Nvidia shares jump as China export curbs eased', '', cof).to.label, 'China');
});
t('locate: tricky names (US / us, South Sudan / Sudan, Georgia the state)', () => {
  assert.equal(G.locate('Let us talk about the weather', '', cof), null);
  assert.equal(G.locate('US imposes tariffs on Canada', '', cof).label, 'United States');
  assert.equal(G.locate('South Sudan clashes leave dozens dead', '', cof).label, 'South Sudan');
  assert.equal(G.locate('Georgia governor signs bill', '', cof), null);
});
t('countryLookup: point in polygon on the vendored map', () => {
  assert.equal(cof(35.69, 51.39), 'Iran'); assert.equal(cof(50.45, 30.52), 'Ukraine'); assert.equal(cof(26.57, 56.25), ''); assert.equal(cof(48.86, 2.35), 'France');
});
t('category: keywords per topic, title counts double', () => {
  assert.equal(G.category('Israeli strikes kill dozens in Gaza'), 'war');
  assert.equal(G.category('Oil jumps as tanker seized near Hormuz'), 'energy');
  assert.equal(G.category('Fed holds interest rates steady'), 'macro');
  assert.equal(G.category('OpenAI unveils new model'), 'ai');
  assert.equal(G.category('Earthquake strikes off the coast of Japan'), 'disaster');
  assert.equal(G.category('A recipe for autumn soup'), 'other');
  assert.equal(G.category('Bitcoin tops new high as ETF inflows surge'), 'crypto');
  assert.equal(G.category('Stablecoin issuer Tether reports record profit'), 'crypto');
  assert.equal(G.category('Taylor Swift announces new album and world tour'), 'music');
  assert.equal(G.category('Wall Street rallies as tech earnings beat'), 'markets');
});
t('stories: the same story from several outlets is one story, ranked above single-outlet ones', () => {
  const h = [
    {source: 'BBC', title: 'Iran threatens to close Strait of Hormuz after tanker seizure', at: NOW - 1 * H, url: 'https://a/1'},
    {source: 'Al Jazeera', title: 'Iran says it may shut Hormuz strait as tanker seized', at: NOW - 1.5 * H, url: 'https://a/2'},
    {source: 'CNBC', title: 'Fed holds rates steady, Powell signals patience on cuts', at: NOW - 1 * H, url: 'https://a/3'},
    {source: 'BBC Business', title: 'Federal Reserve holds interest rates, Powell says inflation sticky', at: NOW - 2 * H, url: 'https://a/4'},
    {source: 'NPR', title: 'Israeli strikes kill dozens in Gaza', at: NOW - 0.5 * H, url: 'https://a/5'},
    {source: 'BBC', title: 'A recipe for autumn soup', at: NOW, url: 'https://a/6'}];
  const s = G.stories(h, NOW, {countryOf: cof});
  assert.equal(s.length, 4);
  assert.equal(s[0].place.label, 'Strait of Hormuz'); assert.deepEqual(s[0].sources, ['BBC', 'Al Jazeera']); assert.equal(s[0].cat, 'energy');
  assert(/Oil supply risk/.test(s[0].impact));
  const fed = s.find(x => x.cat === 'macro'); assert.equal(fed.items.length, 2); assert(/US rates/.test(fed.impact));
  assert.equal(s[s.length - 1].cat, 'other');
});
t('stories: recency decays the score (12 h half-life)', () => {
  const mk = at => G.stories([{source: 'BBC', title: 'Israeli strikes kill dozens in Gaza', at, url: 'https://a'}], NOW)[0].score;
  assert(Math.abs(mk(NOW - 12 * H) / mk(NOW) - 0.5) < 1e-9);
});
t('stories: a news channel video joins the matching story; bad ids are ignored', () => {
  const h = [
    {source: 'The Guardian', title: 'Russia launches massive drone attack on Kyiv overnight', at: NOW - 3 * H, url: 'https://a/1'},
    {source: 'Al Jazeera', title: 'Russia launches drone attack on Kyiv', at: NOW - 2 * H, url: 'https://www.youtube.com/watch?v=abcDEF12345', video: 'abcDEF12345'},
    {source: 'BBC', title: 'Fed holds interest rates steady', at: NOW - 1 * H, url: 'https://a/2', video: 'x"><script>'}];
  const s = G.stories(h, NOW, {countryOf: cof}), kyiv = s.find(x => x.place && x.place.label === 'Kyiv');
  assert.equal(kyiv.items.length, 2); assert.equal(kyiv.video.id, 'abcDEF12345'); assert.equal(kyiv.video.source, 'Al Jazeera');
  assert.equal(s.find(x => x.cat === 'macro').video, null);
});
t('crypto and music: places and market angles', () => {
  const sec = G.locate('SEC sues Coinbase over staking', '', cof); assert.equal(sec.label, 'SEC'); assert.equal(sec.to.label, 'Coinbase, San Francisco');
  assert.equal(G.locate('BTS return to Seoul for reunion concert', '', cof).label, 'Seoul');
  assert.equal(G.locate('El Salvador buys more bitcoin', '', cof).label, 'El Salvador');
  const s = G.stories([{source: 'CoinDesk', title: 'SEC rejects new crypto ETF filing', at: NOW, url: 'https://a/1'},
    {source: 'Billboard', title: 'Spotify raises prices as streaming growth slows for music labels', at: NOW, url: 'https://a/2'}], NOW);
  assert(/Regulation/.test(s.find(x => x.cat === 'crypto').impact)); assert(/streaming stocks/.test(s.find(x => x.cat === 'music').impact));
});
console.log(n + ' tests passed');
