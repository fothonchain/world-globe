/* World Globe: news placing, grouping and ranking. Pure logic: browser window.Geo / node module.exports. Data comes from server.py /api/world.
 * - locate(): pins a headline to a place by keyword matching against a gazetteer (not understanding). Precise spots (straits, cities,
 *   front lines) beat institutions (Fed, OPEC, Nvidia...), which beat countries / demonyms, which beat leaders (Trump -> Washington).
 *   conf: 'spot' (exact place), 'country' (pinned at a country's centre), or no place at all. A second place, if any, becomes an arc.
 * - category(): war, energy & shipping, macro, AI & tech, markets, disasters, politics (keyword counts, title counts double).
 * - stories(): groups the same story told by several outlets, then ranks by category weight x number of outlets x recency.
 * - impact(): a rule-of-thumb market angle (why markets might care). Not advice, not a forecast. */
(function (root) {
'use strict';
// [label, lat, lon, pattern, level, mapName]; level 3 = exact spot, 2.5 = institution / company HQ, 2 = country, 1.5 = leader or seat of government
var S = 3, I = 2.5, C = 2, L = 1.5;
var GAZ = [
  // Middle East: chokepoints, fronts, capitals
  ['Strait of Hormuz', 26.57, 56.25, /\bhormuz\b/i, S], ['Persian Gulf', 27.0, 51.5, /persian gulf|arabian gulf/i, S], ['Gulf of Oman', 24.5, 58.5, /gulf of oman/i, S],
  ['Kharg Island', 29.23, 50.32, /kharg/i, S], ['Red Sea', 20.0, 38.5, /red sea/i, S], ['Bab el-Mandeb', 12.6, 43.3, /bab[ -]?el[ -]?mandeb/i, S],
  ['Gulf of Aden', 12.5, 47.5, /gulf of aden/i, S], ['Suez Canal', 30.6, 32.35, /\bsuez\b/i, S], ['Gaza', 31.42, 34.37, /\bgaza\b|rafah|khan younis/i, S],
  ['West Bank', 31.95, 35.25, /west bank|jenin|ramallah|nablus/i, S], ['Jerusalem', 31.77, 35.21, /jerusalem/i, S], ['Tel Aviv', 32.08, 34.78, /tel aviv/i, S],
  ['Golan Heights', 33.0, 35.75, /golan/i, S], ['Beirut', 33.89, 35.5, /beirut/i, S], ['Southern Lebanon', 33.27, 35.4, /southern lebanon|south lebanon|litani/i, S],
  ['Damascus', 33.51, 36.29, /damascus/i, S], ['Aleppo', 36.2, 37.16, /aleppo/i, S], ['Baghdad', 33.31, 44.36, /baghdad/i, S], ['Erbil', 36.19, 44.01, /erbil|kurdistan region/i, S],
  ['Tehran', 35.69, 51.39, /tehran/i, S], ['Isfahan', 32.65, 51.67, /isfahan/i, S], ['Natanz', 33.72, 51.73, /natanz/i, S], ['Fordow', 34.88, 50.99, /fordow/i, S],
  ['Bushehr', 28.92, 50.84, /bushehr/i, S], ['Sanaa (Houthis)', 15.37, 44.19, /sanaa|sana'a|houthi/i, S], ['Hodeidah', 14.8, 42.95, /hodeidah/i, S],
  ['Riyadh', 24.71, 46.68, /riyadh/i, S], ['Dubai', 25.2, 55.27, /dubai/i, S], ['Abu Dhabi', 24.45, 54.38, /abu dhabi/i, S], ['Doha', 25.29, 51.53, /\bdoha\b/i, S],
  ['Istanbul', 41.01, 28.98, /istanbul|bosphorus/i, S], ['Ankara', 39.93, 32.86, /ankara/i, S],
  // Russia / Ukraine / Europe
  ['Kyiv', 50.45, 30.52, /\bkyiv\b|\bkiev\b/i, S], ['Kharkiv', 49.99, 36.23, /kharkiv/i, S], ['Donbas', 48.0, 37.8, /donbas|donetsk|pokrovsk|bakhmut|kramatorsk|avdiivka|chasiv yar/i, S],
  ['Luhansk', 48.57, 39.31, /luhansk/i, S], ['Zaporizhzhia', 47.84, 35.14, /zaporizhzhia|zaporizhia/i, S], ['Kherson', 46.64, 32.62, /kherson/i, S],
  ['Odesa', 46.48, 30.72, /odesa|odessa/i, S], ['Crimea', 44.95, 34.1, /crimea|sevastopol|kerch/i, S], ['Kursk', 51.73, 36.19, /\bkursk\b/i, S],
  ['Belgorod', 50.6, 36.59, /belgorod/i, S], ['Black Sea', 43.4, 34.0, /black sea/i, S], ['Moscow', 55.76, 37.62, /moscow/i, S], ['Kremlin', 55.75, 37.62, /kremlin/i, L],
  ['St Petersburg', 59.94, 30.31, /st\.? petersburg/i, S], ['Kaliningrad', 54.71, 20.51, /kaliningrad/i, S], ['Baltic Sea', 58.0, 20.0, /baltic sea/i, S],
  ['Brussels (EU)', 50.85, 4.35, /brussels|european commission|european union|\beu\b|von der leyen/i, I], ['NATO HQ', 50.88, 4.42, /\bnato\b/i, I],
  ['ECB, Frankfurt', 50.11, 8.68, /\becb\b|european central bank|lagarde/i, I], ['Frankfurt', 50.11, 8.68, /frankfurt/i, S],
  ['Bank of England', 51.51, -0.09, /bank of england|\bboe\b/i, I], ['London', 51.51, -0.13, /london|downing street|westminster/i, S],
  ['Paris', 48.86, 2.35, /\bparis\b|elysee|élysée/i, S], ['Berlin', 52.52, 13.4, /berlin|bundestag/i, S], ['Rome', 41.9, 12.5, /\brome\b/i, S],
  ['Vatican', 41.9, 12.45, /vatican|\bpope\b/i, I], ['Geneva', 46.2, 6.14, /geneva/i, S], ['Davos', 46.8, 9.84, /davos|world economic forum/i, I],
  ['The Hague', 52.08, 4.3, /the hague|international criminal court|\bicc\b|\bicj\b|international court of justice/i, I], ['OPEC, Vienna', 48.21, 16.37, /\bopec\+?/i, I],
  ['Vienna', 48.21, 16.37, /vienna/i, S], ['Warsaw', 52.23, 21.01, /warsaw/i, S], ['Budapest', 47.5, 19.04, /budapest/i, S], ['Madrid', 40.42, -3.7, /madrid/i, S],
  ['Athens', 37.98, 23.73, /athens/i, S], ['Minsk', 53.9, 27.56, /\bminsk\b/i, S], ['Chisinau', 47.01, 28.86, /chisinau|transnistria/i, S], ['Tbilisi', 41.72, 44.79, /tbilisi/i, S],
  ['Nagorno-Karabakh', 39.82, 46.75, /karabakh/i, S], ['Arctic', 78.0, 15.0, /\barctic\b|svalbard/i, S],
  // Asia / Pacific
  ['Taiwan Strait', 24.5, 119.5, /taiwan strait/i, S], ['Taipei', 25.03, 121.57, /taipei/i, S], ['TSMC, Hsinchu', 24.78, 120.97, /\btsmc\b|hsinchu/i, I],
  ['South China Sea', 12.0, 114.0, /south china sea|spratly|paracel|scarborough shoal|second thomas shoal/i, S], ['East China Sea', 29.0, 125.0, /east china sea|senkaku/i, S],
  ['Beijing', 39.9, 116.4, /beijing|zhongnanhai/i, S], ['Xi Jinping', 39.91, 116.39, /\bxi jinping\b|president xi\b|\bxi\b(?= (?:said|says|warns|meets|calls))/i, L],
  ['PBOC', 39.91, 116.37, /\bpboc\b|people'?s bank of china/i, I], ['Shanghai', 31.23, 121.47, /shanghai/i, S], ['Hong Kong', 22.32, 114.17, /hong kong/i, S],
  ['Shenzhen', 22.54, 114.06, /shenzhen|huawei|byd\b/i, S], ['Hangzhou', 30.27, 120.15, /hangzhou|deepseek|alibaba/i, I], ['Xinjiang', 41.1, 85.2, /xinjiang|uyghur/i, S],
  ['Tibet', 29.65, 91.1, /tibet|lhasa/i, S], ['Tokyo', 35.68, 139.69, /tokyo|nikkei/i, S], ['Bank of Japan', 35.69, 139.77, /bank of japan|\bboj\b|ueda/i, I],
  ['Seoul', 37.57, 126.98, /\bseoul\b|samsung|sk hynix/i, S], ['Pyongyang', 39.04, 125.76, /pyongyang|kim jong/i, S], ['Korean DMZ', 37.95, 126.68, /\bdmz\b|demilitari[sz]ed zone/i, S],
  ['New Delhi', 28.61, 77.21, /new delhi|\bdelhi\b/i, S], ['Narendra Modi', 28.6, 77.2, /\bmodi\b/i, L], ['Mumbai', 19.08, 72.88, /mumbai|reserve bank of india|\brbi\b|sensex/i, S],
  ['Kashmir', 34.08, 74.8, /kashmir|line of control/i, S], ['Islamabad', 33.69, 73.05, /islamabad/i, S], ['Karachi', 24.86, 67.0, /karachi/i, S], ['Kabul', 34.53, 69.17, /kabul|taliban/i, S],
  ['Strait of Malacca', 2.5, 101.3, /malacca/i, S], ['Manila', 14.6, 120.98, /manila/i, S], ['Jakarta', -6.2, 106.85, /jakarta/i, S], ['Bangkok', 13.76, 100.5, /bangkok/i, S],
  ['Hanoi', 21.03, 105.85, /hanoi/i, S], ['Yangon', 16.84, 96.17, /yangon|naypyidaw/i, S], ['Dhaka', 23.81, 90.41, /dhaka/i, S], ['Colombo', 6.93, 79.86, /colombo/i, S],
  ['Canberra', -35.28, 149.13, /canberra/i, S], ['Sydney', -33.87, 151.21, /sydney/i, S], ['Wellington', -41.29, 174.78, /wellington/i, S],
  // Americas
  ['Federal Reserve', 38.89, -77.05, /federal reserve|\bthe fed\b|\bfed\b(?=['’]?s? (?:rate|chair|cut|hike|hold|decision|official|governor|minutes))|\bfomc\b|powell/i, I],
  ['US Treasury', 38.9, -77.03, /\btreasury (?:secretary|department)|bessent/i, I], ['Wall Street', 40.71, -74.01, /wall street|\bnyse\b|\bnasdaq\b|s&p 500|dow jones/i, I],
  ['White House', 38.9, -77.04, /white house|oval office|\btrump\b|\bvance\b/i, L], ['Washington', 38.9, -77.04, /washington|pentagon|capitol hill|\bcongress\b|\bsenate\b|state department/i, L],
  ['New York', 40.71, -74.0, /new york|united nations|\bun\b(?= (?:security council|general assembly|chief|says|report))|\bu\.n\./i, S],
  ['Silicon Valley', 37.39, -122.06, /silicon valley/i, S], ['San Francisco', 37.77, -122.42, /san francisco|openai|anthropic|chatgpt|sam altman/i, I],
  ['Nvidia, Santa Clara', 37.37, -121.96, /nvidia|jensen huang/i, I], ['Google, Mountain View', 37.42, -122.08, /google|alphabet|deepmind|gemini\b/i, I],
  ['Apple, Cupertino', 37.33, -122.01, /\bapple\b|iphone/i, I], ['Meta, Menlo Park', 37.48, -122.15, /\bmeta\b|facebook|instagram|zuckerberg/i, I],
  ['Microsoft, Redmond', 47.67, -122.12, /microsoft|copilot/i, I], ['Amazon, Seattle', 47.62, -122.34, /amazon|\baws\b/i, I], ['Austin (Tesla, xAI)', 30.27, -97.74, /tesla|\bxai\b|elon musk|\bmusk\b/i, I],
  ['ASML, Veldhoven', 51.42, 5.4, /\basml\b/i, I], ['Mistral, Paris', 48.87, 2.33, /mistral ai|\bmistral\b/i, I],
  ['Gulf of Mexico', 25.0, -90.0, /gulf of mexico|gulf of america/i, S], ['Panama Canal', 9.08, -79.68, /panama canal/i, S], ['Caracas', 10.48, -66.9, /caracas|maduro/i, S],
  ['Mexico City', 19.43, -99.13, /mexico city|sheinbaum/i, S], ['Ottawa', 45.42, -75.7, /ottawa/i, S], ['Brasilia', -15.79, -47.88, /brasilia|brasília|\blula\b/i, S],
  ['Buenos Aires', -34.6, -58.38, /buenos aires|\bmilei\b/i, S], ['Havana', 23.11, -82.37, /havana/i, S], ['Caribbean', 15.0, -73.0, /caribbean/i, S],
  ['Los Angeles', 34.05, -118.24, /los angeles/i, S], ['Chicago', 41.88, -87.63, /chicago/i, S], ['Texas', 31.0, -99.0, /\btexas\b/i, S], ['Florida', 28.0, -81.7, /florida/i, S], ['California', 37.0, -120.0, /california/i, S],
  // Africa
  ['Khartoum', 15.5, 32.56, /khartoum/i, S], ['Darfur', 13.5, 24.0, /darfur|el[ -]fasher/i, S], ['Sahel', 15.0, 0.0, /\bsahel\b/i, S], ['Eastern Congo (Goma)', -1.68, 29.22, /\bgoma\b|\bm23\b|north kivu|south kivu/i, S],
  ['Tripoli', 32.89, 13.19, /tripoli/i, S], ['Cairo', 30.04, 31.24, /cairo/i, S], ['Addis Ababa', 9.03, 38.74, /addis ababa/i, S], ['Mogadishu', 2.05, 45.32, /mogadishu|al-shabaab|al shabaab/i, S],
  ['Lagos', 6.52, 3.38, /lagos/i, S], ['Johannesburg', -26.2, 28.05, /johannesburg|pretoria/i, S], ['Nairobi', -1.29, 36.82, /nairobi/i, S], ['Tigray', 14.0, 38.5, /tigray/i, S]
];
// [label, lat, lon, pattern, mapName (countries.geojson name, for highlighting)]; pinned near the middle of the country (or the capital for small ones)
var COUNTRIES = [
  ['United States', 38.9, -77.04, /\b(?:united states|america|american|americans)\b|\bU\.S\.(?!\w)|\bUS\b|\bUSA\b/, 'United States of America'], ['Canada', 56.0, -106.0, /\bcanad(?:a|ian|ians)\b/i, 'Canada'],
  ['Mexico', 23.6, -102.5, /\bmexic(?:o|an|ans)\b/i, 'Mexico'], ['Brazil', -10.3, -53.2, /\bbrazil(?:ian|ians)?\b/i, 'Brazil'], ['Argentina', -34.0, -64.0, /\bargentin(?:a|e|ian|ians)\b/i, 'Argentina'],
  ['Venezuela', 7.1, -66.2, /\bvenezuel(?:a|an|ans)\b/i, 'Venezuela'], ['Colombia', 4.1, -72.9, /\bcolombi(?:a|an|ans)\b/i, 'Colombia'], ['Chile', -33.4, -70.6, /\bchile(?:an|ans)?\b/i, 'Chile'],
  ['Peru', -9.2, -75.0, /\bperu(?:vian|vians)?\b/i, 'Peru'], ['Ecuador', -1.5, -78.4, /\becuador(?:ian|ians)?\b/i, 'Ecuador'], ['Bolivia', -16.7, -64.7, /\bbolivi(?:a|an|ans)\b/i, 'Bolivia'],
  ['Cuba', 21.6, -79.0, /\bcuba(?:n|ns)?\b/i, 'Cuba'], ['Haiti', 19.0, -72.6, /\bhaiti(?:an|ans)?\b/i, 'Haiti'], ['Panama', 8.6, -80.1, /\bpanam(?:a|anian)\b/i, 'Panama'],
  ['Greenland', 72.0, -40.0, /\bgreenland\b/i, 'Greenland'], ['United Kingdom', 52.8, -1.6, /\b(?:united kingdom|britain|british|england|english channel|scotland|wales)\b|\bUK\b/i, 'United Kingdom'],
  ['Ireland', 53.3, -7.7, /\bireland\b|\birish\b/i, 'Ireland'], ['France', 46.6, 2.4, /\bfran(?:ce|ch)\b/i, 'France'], ['Germany', 51.1, 10.4, /\bgerman(?:y|s)?\b/i, 'Germany'],
  ['Italy', 42.8, 12.6, /\ital(?:y|ian|ians)\b/i, 'Italy'], ['Spain', 40.2, -3.6, /\bspa(?:in|nish)\b/i, 'Spain'], ['Portugal', 39.6, -8.0, /\bportug(?:al|uese)\b/i, 'Portugal'],
  ['Netherlands', 52.2, 5.5, /\bnetherlands\b|\bdutch\b|\bholland\b/i, 'Netherlands'], ['Belgium', 50.6, 4.6, /\bbelgi(?:um|an|ans)\b/i, 'Belgium'], ['Switzerland', 46.8, 8.2, /\bswi(?:tzerland|ss)\b/i, 'Switzerland'],
  ['Austria', 47.6, 14.1, /\baustria(?:n|ns)?\b/i, 'Austria'], ['Poland', 52.1, 19.4, /\bpol(?:and|ish)\b|\bpoles\b/i, 'Poland'], ['Czechia', 49.8, 15.5, /\bczech(?:ia)?\b/i, 'Czechia'],
  ['Hungary', 47.2, 19.4, /\bhungar(?:y|ian|ians)\b|\borban\b|\borbán\b/i, 'Hungary'], ['Romania', 45.9, 24.9, /\bromania(?:n|ns)?\b/i, 'Romania'], ['Bulgaria', 42.7, 25.5, /\bbulgaria(?:n|ns)?\b/i, 'Bulgaria'],
  ['Greece', 39.1, 22.0, /\bgree(?:ce|k|ks)\b/i, 'Greece'], ['Serbia', 44.0, 20.8, /\bserbia(?:n|ns)?\b/i, 'Serbia'], ['Kosovo', 42.6, 20.9, /\bkosovo\b/i, 'Kosovo'],
  ['Bosnia', 44.2, 17.8, /\bbosnia(?:n|ns)?\b/i, 'Bosnia and Herz.'], ['Croatia', 45.1, 15.2, /\bcroatia(?:n|ns)?\b/i, 'Croatia'], ['Sweden', 62.0, 15.0, /\bswe(?:den|dish)\b/i, 'Sweden'],
  ['Norway', 61.0, 9.0, /\bnorw(?:ay|egian|egians)\b/i, 'Norway'], ['Finland', 63.0, 26.0, /\bfin(?:land|nish)\b/i, 'Finland'], ['Denmark', 56.0, 9.5, /\bdenmark\b|\bdanish\b/i, 'Denmark'],
  ['Estonia', 58.7, 25.5, /\bestonia(?:n|ns)?\b/i, 'Estonia'], ['Latvia', 56.9, 24.6, /\blatvia(?:n|ns)?\b/i, 'Latvia'], ['Lithuania', 55.3, 23.9, /\blithuania(?:n|ns)?\b/i, 'Lithuania'],
  ['Belarus', 53.7, 27.9, /\bbelarus(?:ian|ians)?\b|lukashenko/i, 'Belarus'], ['Moldova', 47.2, 28.5, /\bmoldova(?:n|ns)?\b/i, 'Moldova'],
  ['Ukraine', 49.0, 31.5, /\bukrain(?:e|ian|ians)\b|zelensky/i, 'Ukraine'], ['Russia', 56.0, 40.0, /\brussia(?:n|ns)?\b|\bputin\b/i, 'Russia'],
  ['Georgia', 42.3, 43.4, /\bgeorgia\b(?! (?:state|senate|governor|voters|county))|\bgeorgian\b/i, 'Georgia'], ['Armenia', 40.1, 45.0, /\barmenia(?:n|ns)?\b/i, 'Armenia'],
  ['Azerbaijan', 40.3, 47.6, /\bazerbaijan(?:i|is)?\b/i, 'Azerbaijan'], ['Turkey', 39.0, 35.2, /\bturk(?:ey|iye|iye|ish)\b|türkiye|erdogan|erdoğan/i, 'Turkey'],
  ['Cyprus', 35.1, 33.4, /\bcyprus\b|\bcypriot\b/i, 'Cyprus'], ['Israel', 31.2, 34.9, /\bisrael(?:i|is)?\b|netanyahu|\bidf\b/i, 'Israel'],
  ['Palestinian territories', 31.9, 35.2, /\bpalestin(?:e|ian|ians)\b|\bhamas\b/i, 'Palestine'], ['Lebanon', 33.9, 35.9, /\bleban(?:on|ese)\b|hezbollah/i, 'Lebanon'],
  ['Syria', 35.0, 38.5, /\bsyria(?:n|ns)?\b/i, 'Syria'], ['Jordan', 31.2, 36.5, /\bjordan(?:ian|ians)?\b(?! river)/i, 'Jordan'], ['Iraq', 33.2, 43.7, /\biraq(?:i|is)?\b/i, 'Iraq'],
  ['Iran', 32.4, 53.7, /\biran(?:ian|ians)?\b|khamenei|\birgc\b/i, 'Iran'], ['Saudi Arabia', 23.9, 45.1, /\bsaudi(?:s| arabia)?\b|aramco/i, 'Saudi Arabia'],
  ['Yemen', 15.6, 48.0, /\byemen(?:i|is)?\b/i, 'Yemen'], ['Oman', 21.5, 57.0, /\boman(?:i|is)?\b/i, 'Oman'], ['UAE', 23.4, 53.8, /\bunited arab emirates\b|\buae\b|emirati/i, 'United Arab Emirates'],
  ['Qatar', 25.3, 51.2, /\bqatar(?:i|is)?\b/i, 'Qatar'], ['Kuwait', 29.3, 47.5, /\bkuwait(?:i|is)?\b/i, 'Kuwait'], ['Egypt', 26.8, 30.8, /\begypt(?:ian|ians)?\b/i, 'Egypt'],
  ['Libya', 27.0, 17.2, /\bliby(?:a|an|ans)\b/i, 'Libya'], ['Tunisia', 34.0, 9.5, /\btunisia(?:n|ns)?\b/i, 'Tunisia'], ['Algeria', 28.0, 2.6, /\balgeria(?:n|ns)?\b/i, 'Algeria'],
  ['Morocco', 31.8, -7.1, /\bmorocc(?:o|an|ans)\b/i, 'Morocco'], ['Sudan', 15.6, 30.2, /\bsudan(?:ese)?\b(?<!south sudan)|\brsf\b|rapid support forces/i, 'Sudan'],
  ['South Sudan', 7.3, 30.3, /south sudan/i, 'S. Sudan'], ['Ethiopia', 9.1, 40.5, /\bethiopia(?:n|ns)?\b/i, 'Ethiopia'], ['Eritrea', 15.2, 39.8, /\beritrea(?:n|ns)?\b/i, 'Eritrea'],
  ['Somalia', 5.2, 46.2, /\bsomali(?:a|s)?\b/i, 'Somalia'], ['Kenya', 0.0, 37.9, /\bkenya(?:n|ns)?\b/i, 'Kenya'], ['Uganda', 1.4, 32.3, /\buganda(?:n|ns)?\b/i, 'Uganda'],
  ['Rwanda', -1.9, 29.9, /\brwanda(?:n|ns)?\b/i, 'Rwanda'], ['DR Congo', -2.9, 23.6, /\b(?:dr congo|drc|democratic republic of (?:the )?congo|congolese)\b/i, 'Dem. Rep. Congo'],
  ['Nigeria', 9.1, 8.7, /\bnigeria(?:n|ns)?\b/i, 'Nigeria'], ['Niger', 17.6, 8.1, /\bniger\b/i, 'Niger'], ['Mali', 17.6, -4.0, /\bmali(?:an|ans)?\b/i, 'Mali'],
  ['Burkina Faso', 12.2, -1.6, /burkina/i, 'Burkina Faso'], ['Chad', 15.5, 18.7, /\bchad(?:ian|ians)?\b(?= |,|\.|$)/, 'Chad'], ['Ghana', 7.9, -1.0, /\bghana(?:ian|ians)?\b/i, 'Ghana'],
  ['Senegal', 14.5, -14.5, /\bsenegal(?:ese)?\b/i, 'Senegal'], ['South Africa', -30.6, 22.9, /south africa(?:n|ns)?/i, 'South Africa'], ['Zimbabwe', -19.0, 29.2, /\bzimbabwe(?:an|ans)?\b/i, 'Zimbabwe'],
  ['Mozambique', -18.7, 35.5, /\bmozambi(?:que|can)\b/i, 'Mozambique'], ['Angola', -11.2, 17.9, /\bangola(?:n|ns)?\b/i, 'Angola'], ['Madagascar', -18.8, 46.9, /\bmadagascar\b/i, 'Madagascar'],
  ['Afghanistan', 33.9, 67.7, /\bafghan(?:istan|s)?\b/i, 'Afghanistan'], ['Pakistan', 30.4, 69.3, /\bpakistan(?:i|is)?\b/i, 'Pakistan'], ['India', 21.0, 78.0, /\bindia(?:n|ns)?\b/i, 'India'],
  ['Bangladesh', 23.7, 90.4, /\bbangladesh(?:i|is)?\b/i, 'Bangladesh'], ['Sri Lanka', 7.9, 80.8, /sri lanka(?:n|ns)?/i, 'Sri Lanka'], ['Nepal', 28.4, 84.1, /\bnepal(?:i|ese)?\b/i, 'Nepal'],
  ['China', 35.0, 104.0, /\bchin(?:a|ese)\b/i, 'China'], ['Taiwan', 23.7, 121.0, /\btaiwan(?:ese)?\b/i, 'Taiwan'], ['Japan', 36.2, 138.3, /\bjapan(?:ese)?\b|\byen\b/i, 'Japan'],
  ['South Korea', 36.5, 127.9, /south korea(?:n|ns)?|\bseoul\b/i, 'South Korea'], ['North Korea', 40.3, 127.5, /north korea(?:n|ns)?/i, 'North Korea'], ['Mongolia', 46.9, 103.8, /\bmongolia(?:n|ns)?\b/i, 'Mongolia'],
  ['Kazakhstan', 48.0, 67.0, /\bkazakh(?:stan)?\b/i, 'Kazakhstan'], ['Uzbekistan', 41.4, 64.6, /\buzbek(?:istan)?\b/i, 'Uzbekistan'], ['Myanmar', 21.9, 95.9, /\bmyanmar\b|\bburm(?:a|ese)\b/i, 'Myanmar'],
  ['Thailand', 15.9, 100.99, /\bthai(?:land)?\b/i, 'Thailand'], ['Cambodia', 12.6, 104.99, /\bcambodia(?:n|ns)?\b/i, 'Cambodia'], ['Vietnam', 14.1, 108.3, /\bvietnam(?:ese)?\b/i, 'Vietnam'],
  ['Philippines', 12.9, 121.8, /\bphilippine(?:s)?\b|\bfilipino(?:s)?\b/i, 'Philippines'], ['Malaysia', 4.2, 102.0, /\bmalaysia(?:n|ns)?\b/i, 'Malaysia'],
  ['Singapore', 1.35, 103.82, /\bsingapore(?:an|ans)?\b/i, ''], ['Indonesia', -2.5, 118.0, /\bindonesia(?:n|ns)?\b/i, 'Indonesia'], ['Australia', -25.3, 133.8, /\baustralia(?:n|ns)?\b/i, 'Australia'],
  ['New Zealand', -41.0, 174.0, /new zealand/i, 'New Zealand'], ['Papua New Guinea', -6.3, 143.96, /papua new guinea/i, 'Papua New Guinea']
];
var PLACES = GAZ.map(function (g) { return {label: g[0], lat: g[1], lon: g[2], re: g[3], level: g[4], map: ''}; })
  .concat(COUNTRIES.map(function (c) { return {label: c[0], lat: c[1], lon: c[2], re: c[3], level: C, map: c[4]}; }));

// every place a text names, best first: higher level, then the earlier mention (title before summary).
// countryOf(lat, lon) -> map name (optional; app.js passes a lookup on countries.geojson) lets a country drop out when a spot
// inside it was already picked (Tehran, then Iran).
function places(title, summary, countryOf) {
  var t = String(title || ''), s = String(summary || ''), hits = [];
  PLACES.forEach(function (p) {
    var m = p.re.exec(t), at = m ? m.index : -1;
    if (at < 0) { m = p.re.exec(s); at = m ? 1000 + m.index : -1; }
    if (at >= 0) hits.push({p: p, at: at});
  });
  hits.sort(function (a, b) { return b.p.level - a.p.level || a.at - b.at; });
  var out = [];
  hits.forEach(function (h) { // one pin per area: skip a place within ~150 km of a better one (Kremlin after Moscow, Fed after White House)
    var p = h.p, inside = p.map || (countryOf ? countryOf(p.lat, p.lon) || '' : '');
    if (out.some(function (o) { return dist(o, p) < 150 || (inside && o.inside === inside && (p.level === C || o.level === C)); })) return;
    out.push({label: p.label, lat: p.lat, lon: p.lon, level: p.level, map: p.map, inside: inside});
  });
  return out;
}
function dist(a, b) { // km, great circle
  var r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2), y = Math.sin((b.lon - a.lon) * r / 2);
  return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a.lat * r) * Math.cos(b.lat * r) * y * y));
}
function locate(title, summary, countryOf) {
  var ps = places(title, summary, countryOf), p = ps[0];
  if (!p) return null;
  var to = ps[1] || null;
  return {label: p.label, lat: p.lat, lon: p.lon, conf: p.level === C ? 'country' : 'spot', map: p.map,
    to: to ? {label: to.label, lat: to.lat, lon: to.lon} : null, all: ps.map(function (q) { return q.label; }), maps: ps.map(function (q) { return q.inside; }).filter(Boolean)};
}
// point in polygon on GeoJSON features (ray casting; lon / lat as flat coordinates, good enough for picking a country)
function inRing(r, x, y) {
  var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
    var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function countryLookup(features) {
  return function (lat, lon) {
    for (var i = 0; i < features.length; i++) {
      var g = features[i].geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (var k = 0; k < polys.length; k++) if (inRing(polys[k][0], lon, lat) && !polys[k].slice(1).some(function (h) { return inRing(h, lon, lat); })) return features[i].properties.name;
    }
    return '';
  };
}

/* ---------- category ---------- */
var CATS = [ // order = tie break
  ['war', 'War & conflict', 1.0, /\b(?:war|wars|missile|missiles|drone|drones|troops|military|army|airstrikes?|air strikes?|strikes? on|shelling|bomb(?:s|ing|ed)?|invasion|invade[sd]?|ceasefire|truce|hostages?|militants?|rebels?|insurgents?|offensive|front ?line|warships?|navy|naval|soldiers|fighters|fighting|kill(?:s|ed|ing)?|casualties|strikes? (?:on|in|hit|kill)|exchanges? (?:of )?fire|gunfire|opened fire|attacks?|attacked|seiz(?:e|es|ed)|militias?|rsf|military drills|drills|nuclear (?:weapon|warhead|test)|hamas|hezbollah|houthis?|idf|nato|clashes|artillery|interceptor)\b/i],
  ['energy', 'Energy & shipping', 0.95, /\b(?:oil|crude|brent|wti|opec\+?|natural gas|lng|gas prices?|pipelines?|tankers?|refiner(?:y|ies)|barrels?|energy|shipping|freight|cargo|strait|hormuz|suez|red sea|chokepoint|fuel|petrol|gasoline|diesel|power grid|electricity)\b/i],
  ['macro', 'Macro & central banks', 0.9, /\b(?:federal reserve|the fed|fed|fomc|ecb|bank of england|bank of japan|boj|pboc|central banks?|interest rates?|rate (?:cut|hike|decision)s?|inflation|cpi|gdp|recession|jobs report|payrolls|unemployment|tariffs?|trade (?:war|deal|talks)|debt|deficit|bonds?|yields?|treasur(?:y|ies)|economy|economic|imf|world bank|currency|dollar|yen|yuan|euro|stimulus|budget)\b/i],
  ['ai', 'AI & tech', 0.85, /\b(?:ai|a\.i\.|artificial intelligence|openai|anthropic|chatgpt|claude|gemini|deepmind|nvidia|chips?|chipmakers?|semiconductors?|tsmc|asml|deepseek|llms?|data cent(?:er|re)s?|robots?|robotics|machine learning|superintelligence|agi|quantum)\b/i],
  ['markets', 'Markets', 0.75, /\b(?:stocks?|shares|equities|wall street|nasdaq|s&p|dow|markets?|bitcoin|crypto|gold|silver|ipo|earnings|investors|sell-?off|rally|rallies|bull|bear|hedge funds?|valuation)\b/i],
  ['disaster', 'Disasters & health', 0.8, /\b(?:earthquakes?|quake|hurricanes?|typhoons?|cyclones?|floods?|flooding|wildfires?|tsunami|volcano|eruption|storms?|drought|heatwave|outbreak|pandemic|epidemic|virus|cholera|ebola|famine|landslide)\b/i],
  ['politics', 'Politics & diplomacy', 0.7, /\b(?:elections?|vote[sd]?|voters|president|prime minister|parliament|government|protests?|protesters|coup|sanctions?|summit|diplomat(?:s|ic)?|talks|treaty|minister|opposition|referendum|impeach(?:ment)?|cabinet|resigns?)\b/i]
];
var CAT_INFO = {}; CATS.forEach(function (c) { CAT_INFO[c[0]] = {key: c[0], label: c[1], w: c[2]}; }); CAT_INFO.other = {key: 'other', label: 'Other', w: 0.4};
function count(re, s) { var g = new RegExp(re.source, 'gi'), n = 0; while (g.exec(s)) n++; return n; }
function category(title, summary) {
  var best = 'other', bs = 0;
  CATS.forEach(function (c) { var sc = 2 * count(c[3], title || '') + count(c[3], summary || ''); if (sc > bs) { bs = sc; best = c[0]; } });
  return best;
}

/* ---------- same story, several outlets ---------- */
var STOP = 'a an the of to in on for at by with from and or as is are was were be been it its this that after over into amid says said say new us not but has have will would could can than more about up out off what who why how live latest news report reports'.split(' ');
var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });
function tokens(t) {
  var out = {}; String(t || '').toLowerCase().replace(/[’']s\b/g, '').split(/[^a-z0-9]+/).forEach(function (w) { if (w.length > 2 && !STOPSET[w]) out[w.replace(/s$/, '')] = 1; });
  return out;
}
function jaccard(a, b) {
  var n = 0, u = 0, k; for (k in a) { u++; if (b[k]) n++; } for (k in b) if (!a[k]) u++;
  return u ? n / u : 0;
}
// headlines [{title, summary, url, source, at}] -> ranked stories
function stories(items, now, opt) {
  opt = opt || {}; var cof = opt.countryOf, half = (opt.halfLifeH || 12) * 3600e3, out = [];
  (items || []).slice().sort(function (a, b) { return b.at - a.at; }).forEach(function (h) {
    if (!h || !h.title) return;
    var tk = tokens(h.title), loc = locate(h.title, h.summary, cof), best = null, bj = 0;
    out.forEach(function (s) {
      var j = jaccard(tk, s.tk), samePlace = loc && s.place && loc.label === s.place.label;
      if ((j >= 0.4 && Math.abs(s.at - h.at) < 48 * 3600e3 || samePlace && j >= 0.2 && Math.abs(s.at - h.at) < 12 * 3600e3) && j > bj) { bj = j; best = s; }
    });
    if (best) {
      if (!best.items.some(function (x) { return x.source === h.source; })) best.sources.push(h.source);
      best.items.push(h); for (var k in tk) best.tk[k] = 1;
      if (!best.place && loc) best.place = loc;
      return;
    }
    out.push({id: idOf(h), title: h.title, summary: h.summary || '', url: h.url, at: h.at, place: loc, tk: tk, items: [h], sources: [h.source]});
  });
  out.forEach(function (s) {
    var text = s.items.map(function (x) { return x.title; }).join(' . ');
    s.cat = category(text, s.summary);
    var ageH = Math.max(0, (now - s.at) / 3600e3);
    s.score = CAT_INFO[s.cat].w * (1 + 0.6 * Math.min(s.sources.length - 1, 5)) * Math.pow(0.5, ageH * 3600e3 / half);
    s.impact = impact(s);
    delete s.tk;
  });
  return out.sort(function (a, b) { return b.score - a.score; });
}
function idOf(h) { var s = String(h.url || h.title), x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return 'w' + (x >>> 0).toString(36); }

/* ---------- market angle (rule of thumb, not a forecast) ---------- */
var GULF = /hormuz|persian gulf|gulf of oman|kharg|red sea|bab el-mandeb|gulf of aden|suez|iran|saudi|iraq|kuwait|qatar|uae|oman|yemen|houthi|opec|tehran|riyadh|bushehr|isfahan|natanz|fordow/i;
function impact(s) {
  var t = s.items.map(function (x) { return x.title; }).join(' ') + ' ' + (s.summary || ''), at = s.place ? s.place.all.join(' ') : '';
  if (s.cat === 'energy') return GULF.test(t + ' ' + at) ? 'Oil supply risk: crude up, risk-off' : /shipping|freight|cargo|canal|strait/i.test(t) ? 'Shipping costs, supply chains, inflation' : 'Energy prices, inflation expectations';
  if (s.cat === 'war') return GULF.test(t + ' ' + at) ? 'Middle East risk: oil up, risk-off, gold / USD bid' : /taiwan|china|south china sea/i.test(t + ' ' + at) ? 'Taiwan / China risk: chips, Asian stocks, risk-off' : 'Geopolitical risk: risk-off, gold / USD bid';
  if (s.cat === 'macro') {
    if (/federal reserve|\bfed\b|fomc|powell/i.test(t)) return 'US rates: USD, yields, BTC volatility';
    if (/\becb\b|lagarde/i.test(t)) return 'Euro rates: EUR / USD';
    if (/bank of japan|\bboj\b|\byen\b/i.test(t)) return 'Yen / carry trade: global risk appetite';
    if (/tariff|trade war|trade talks|trade deal/i.test(t)) return 'Trade war: risk-off, USD, commodities';
    if (/inflation|cpi/i.test(t)) return 'Inflation: rate expectations, USD, BTC';
    return 'Macro: rates, USD, risk appetite';
  }
  if (s.cat === 'ai') return /chip|semiconductor|nvidia|tsmc|asml|export/i.test(t) ? 'Chip stocks (NVDA, TSMC), Nasdaq sentiment' : 'AI / tech stocks, Nasdaq sentiment';
  if (s.cat === 'markets') return /bitcoin|crypto/i.test(t) ? 'Crypto sentiment directly' : 'Market sentiment: risk on / off';
  if (s.cat === 'disaster') return 'Local supply chains, insurance, commodities nearby';
  if (s.cat === 'politics') return /sanction/i.test(t) ? 'Sanctions: trade flows, commodities' : /election|vote/i.test(t) ? 'Policy uncertainty: local currency / stocks' : '';
  return '';
}

var Geo = {GAZ: GAZ, COUNTRIES: COUNTRIES, places: places, locate: locate, category: category, CAT_INFO: CAT_INFO, CATS: CATS.map(function (c) { return c[0]; }), stories: stories, impact: impact, countryLookup: countryLookup, tokens: tokens, jaccard: jaccard, dist: dist};
if (typeof module !== 'undefined' && module.exports) module.exports = Geo; else root.Geo = Geo;
})(typeof window !== 'undefined' ? window : this);
