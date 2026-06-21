import { fetchScoreboard, fetchStandings, fetchNews, fetchSchedule,
         fetchMatchSummary, fetchTeamRoster, fetchPredictions } from './api.js';
import { streamMatchAnalysis, streamDailyDigest, summariseArticle } from './ai.js';

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  matches: [], standings: [], news: [], schedule: [],
  activeSection: 'scores', selectedMatch: null, newsExpanded: new Set(),
  teamIdMap: {}, // abbr → ESPN team ID
  predictionCache: {}, // eventId → prediction text
  matchOdds: {}, // eventId → {home, draw, away} probabilities (0-100)
};

// ── Historical data ───────────────────────────────────────────────────────
const WC_HISTORY = [
  { year:2022, host:'Qatar 🇶🇦',        champion:'Argentina 🇦🇷', runnerUp:'France 🇫🇷',      third:'Croatia 🇭🇷',   goals:172, teams:32, gpg:2.69 },
  { year:2018, host:'Russia 🇷🇺',        champion:'France 🇫🇷',    runnerUp:'Croatia 🇭🇷',     third:'Belgium 🇧🇪',   goals:169, teams:32, gpg:2.64 },
  { year:2014, host:'Brazil 🇧🇷',        champion:'Germany 🇩🇪',   runnerUp:'Argentina 🇦🇷',   third:'Netherlands 🇳🇱',goals:171, teams:32, gpg:2.67 },
  { year:2010, host:'South Africa 🇿🇦',  champion:'Spain 🇪🇸',     runnerUp:'Netherlands 🇳🇱', third:'Germany 🇩🇪',   goals:145, teams:32, gpg:2.27 },
  { year:2006, host:'Germany 🇩🇪',       champion:'Italy 🇮🇹',     runnerUp:'France 🇫🇷',      third:'Germany 🇩🇪',   goals:147, teams:32, gpg:2.30 },
  { year:2002, host:'Korea/Japan 🇰🇷🇯🇵',  champion:'Brazil 🇧🇷',    runnerUp:'Germany 🇩🇪',     third:'Turkey 🇹🇷',    goals:161, teams:32, gpg:2.52 },
  { year:1998, host:'France 🇫🇷',        champion:'France 🇫🇷',    runnerUp:'Brazil 🇧🇷',      third:'Croatia 🇭🇷',   goals:171, teams:32, gpg:2.67 },
  { year:1994, host:'USA 🇺🇸',           champion:'Brazil 🇧🇷',    runnerUp:'Italy 🇮🇹',       third:'Sweden 🇸🇪',    goals:141, teams:24, gpg:2.71 },
  { year:1990, host:'Italy 🇮🇹',         champion:'Germany 🇩🇪',   runnerUp:'Argentina 🇦🇷',   third:'Italy 🇮🇹',     goals:115, teams:24, gpg:2.21 },
  { year:1986, host:'Mexico 🇲🇽',        champion:'Argentina 🇦🇷', runnerUp:'Germany 🇩🇪',     third:'France 🇫🇷',    goals:132, teams:24, gpg:2.54 },
  { year:1982, host:'Spain 🇪🇸',         champion:'Italy 🇮🇹',     runnerUp:'Germany 🇩🇪',     third:'Poland 🇵🇱',    goals:146, teams:24, gpg:2.81 },
  { year:1978, host:'Argentina 🇦🇷',     champion:'Argentina 🇦🇷', runnerUp:'Netherlands 🇳🇱', third:'Brazil 🇧🇷',    goals:102, teams:16, gpg:2.68 },
  { year:1974, host:'Germany 🇩🇪',       champion:'Germany 🇩🇪',   runnerUp:'Netherlands 🇳🇱', third:'Poland 🇵🇱',    goals:97,  teams:16, gpg:2.55 },
  { year:1970, host:'Mexico 🇲🇽',        champion:'Brazil 🇧🇷',    runnerUp:'Italy 🇮🇹',       third:'Germany 🇩🇪',   goals:95,  teams:16, gpg:2.97 },
  { year:1966, host:'England 🏴󠁧󠁢󠁥󠁮󠁧󠁿',       champion:'England 🏴󠁧󠁢󠁥󠁮󠁧󠁿',  runnerUp:'Germany 🇩🇪',     third:'Portugal 🇵🇹',  goals:89,  teams:16, gpg:2.34 },
  { year:1962, host:'Chile 🇨🇱',         champion:'Brazil 🇧🇷',    runnerUp:'Czechoslovakia', third:'Chile 🇨🇱',     goals:89,  teams:16, gpg:2.78 },
  { year:1958, host:'Sweden 🇸🇪',        champion:'Brazil 🇧🇷',    runnerUp:'Sweden 🇸🇪',      third:'France 🇫🇷',    goals:126, teams:16, gpg:3.60 },
  { year:1954, host:'Switzerland 🇨🇭',   champion:'Germany 🇩🇪',   runnerUp:'Hungary 🇭🇺',     third:'Austria 🇦🇹',   goals:140, teams:16, gpg:5.38 },
  { year:1950, host:'Brazil 🇧🇷',        champion:'Uruguay 🇺🇾',   runnerUp:'Brazil 🇧🇷',      third:'Sweden 🇸🇪',    goals:88,  teams:13, gpg:4.00 },
  { year:1938, host:'France 🇫🇷',        champion:'Italy 🇮🇹',     runnerUp:'Hungary 🇭🇺',     third:'Brazil 🇧🇷',    goals:84,  teams:15, gpg:4.67 },
  { year:1934, host:'Italy 🇮🇹',         champion:'Italy 🇮🇹',     runnerUp:'Czechoslovakia', third:'Germany 🇩🇪',   goals:70,  teams:16, gpg:4.12 },
  { year:1930, host:'Uruguay 🇺🇾',       champion:'Uruguay 🇺🇾',   runnerUp:'Argentina 🇦🇷',   third:'USA 🇺🇸',       goals:70,  teams:13, gpg:3.89 },
];

const ALL_TIME_SCORERS = [
  { name:'Miroslav Klose',      flag:'🇩🇪', country:'Germany',    goals:16, years:'2002–2014', note:'Most WC goals ever — and all headers & tap-ins, zero penalties' },
  { name:'Ronaldo (R9)',         flag:'🇧🇷', country:'Brazil',     goals:15, years:'1994–2006', note:'Only player to score in 4 different World Cups' },
  { name:'Gerd Müller',         flag:'🇩🇪', country:'Germany',    goals:14, years:'1970–1974', note:'Der Bomber — 14 goals in just 13 games' },
  { name:'Just Fontaine',        flag:'🇫🇷', country:'France',     goals:13, years:'1958',      note:'13 goals in a single tournament — an untouchable record' },
  { name:'Pelé',                 flag:'🇧🇷', country:'Brazil',     goals:12, years:'1958–1970', note:'Only 3-time World Cup winner; 17 years old in his first final' },
  { name:'Sandor Kocsis',        flag:'🇭🇺', country:'Hungary',    goals:11, years:'1954',      note:'"Golden Head" — 7 of 11 goals were headers' },
  { name:'Jürgen Klinsmann',     flag:'🇩🇪', country:'Germany',    goals:11, years:'1990–1998', note:'Consistent across 3 tournaments' },
  { name:'Ronaldo (CR7)',        flag:'🇵🇹', country:'Portugal',   goals:8,  years:'2006–2022', note:'8 goals across 5 World Cups' },
  { name:'Lionel Messi',         flag:'🇦🇷', country:'Argentina',  goals:13, years:'2006–2022', note:'13 goals, finally lifted the trophy in 2022 at age 35' },
  { name:'Gabriel Batistuta',    flag:'🇦🇷', country:'Argentina',  goals:10, years:'1994–2002', note:'Batigol — scored in every group game across 3 tournaments' },
  { name:'Teófilo Cubillas',     flag:'🇵🇪', country:'Peru',       goals:10, years:'1970–1978', note:'Only South American in top-10 besides Brazilians and Argentines' },
  { name:'Thomas Müller',        flag:'🇩🇪', country:'Germany',    goals:10, years:'2010–2018', note:'10 goals + 6 assists; "Raumdeuter" (space interpreter)' },
];

const WC_TITLES = [
  { country:'Brazil',    flag:'🇧🇷', titles:5, years:'1958, 1962, 1970, 1994, 2002' },
  { country:'Germany',   flag:'🇩🇪', titles:4, years:'1954, 1974, 1990, 2014' },
  { country:'Italy',     flag:'🇮🇹', titles:4, years:'1934, 1938, 1982, 2006' },
  { country:'Argentina', flag:'🇦🇷', titles:3, years:'1978, 1986, 2022' },
  { country:'France',    flag:'🇫🇷', titles:2, years:'1998, 2018' },
  { country:'Uruguay',   flag:'🇺🇾', titles:2, years:'1930, 1950' },
  { country:'England',   flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', titles:1, years:'1966' },
  { country:'Spain',     flag:'🇪🇸', titles:1, years:'2010' },
];

const WC_RECORDS = [
  { icon:'🏆', label:'Most goals in one match',     value:'Hungary 10–1 El Salvador (1982)' },
  { icon:'⚡', label:'Fastest WC goal',             value:'Hakan Şükür — 11 seconds (Turkey vs South Korea, 2002)' },
  { icon:'👴', label:'Oldest WC scorer',            value:'Roger Milla — 42 years (Cameroon, 1994)' },
  { icon:'🧒', label:'Youngest WC scorer',          value:'Pelé — 17 years 239 days (Brazil, 1958)' },
  { icon:'🧤', label:'Most saves in one match',     value:'Ricardo (Portugal) — 17 saves vs England, 2006' },
  { icon:'🟨', label:'Fastest yellow card',         value:'Jose Batista (Uruguay) — 56 seconds (1986)' },
  { icon:'🔴', label:'Most WC red cards ever',      value:'Zinedine Zidane headbutt — most memorable single red' },
  { icon:'🎯', label:'Highest scoring tournament',  value:'1954 Switzerland — 26 games, 140 goals (5.38/game!)' },
  { icon:'📅', label:'Longest WC unbeaten run',     value:'Brazil — 13 games unbeaten (1958–1966)' },
  { icon:'🌍', label:'First World Cup',             value:'Uruguay, 1930 — 13 nations, 18 matches, 70 goals' },
  { icon:'🆕', label:'2026 First ever',             value:'48 teams — largest World Cup in history' },
  { icon:'🏟', label:'Most WC finals wins (host)',  value:'Azteca hosts 3 WC games: 1970, 1986, 2026' },
];

// Where to watch (free or included with major packages)
const BROADCASTS_GUIDE = [
  { region:'🇺🇸 USA',      channels:['Fox Sports / FS1 (English)','Telemundo (Spanish — free OTA)','Peacock (Spanish streaming)'], free:'Telemundo free over-the-air', link:'https://www.telemundo.com/copa-mundial-2026' },
  { region:'🇨🇦 Canada',   channels:['CTV (free!) (English)','TVA Sports (French)','TSN (subscription)'], free:'CTV free streaming', link:'https://www.ctv.ca' },
  { region:'🇲🇽 Mexico',   channels:['TV Azteca (free OTA)','Canal de las Estrellas / Televisa (free OTA)'], free:'TV Azteca & Televisa free', link:'https://www.aztecadeportes.com' },
  { region:'🇬🇧 UK',       channels:['ITV (free)','BBC (some matches — free)'], free:'ITV & BBC free streaming', link:'https://www.itv.com/sport/football' },
  { region:'🇦🇺 Australia',channels:['SBS (free!)'], free:'SBS free streaming', link:'https://www.sbs.com.au/sport/football' },
  { region:'🌍 Global',    channels:['FIFA+ (highlights — free)','Official FIFA YouTube channel'], free:'FIFA+ free highlights', link:'https://www.fifa.com/fifaplus/en' },
];

// ── Image proxy — routes through weserv.nl CDN to avoid Wikimedia rate limits
const wp = (wikiPath, w = 600) =>
  `https://images.weserv.nl/?url=upload.wikimedia.org${wikiPath}&w=${w}&fit=cover&output=jpg`;

// ── Stadium & city photo lookup (Wikimedia Commons via weserv.nl CDN) ────────
const STADIUM_PHOTOS = {
  'MetLife Stadium':       wp('/wikipedia/commons/thumb/0/04/Metlife_stadium_%28Aerial_view%29.jpg/960px-Metlife_stadium_%28Aerial_view%29.jpg'),
  'SoFi Stadium':          wp('/wikipedia/commons/thumb/b/b3/SoFi_Stadium_2023.jpg/960px-SoFi_Stadium_2023.jpg'),
  'AT&T Stadium':          wp('/wikipedia/commons/thumb/1/11/Arlington_June_2020_4_%28AT%26T_Stadium%29.jpg/960px-Arlington_June_2020_4_%28AT%26T_Stadium%29.jpg'),
  "Levi's Stadium":        wp('/wikipedia/commons/thumb/a/a6/Levi%27s_Stadium_in_February_2016_prior_to_Super_Bowl_50_%2824398261729%29.jpg/960px-Levi%27s_Stadium_in_February_2016_prior_to_Super_Bowl_50_%2824398261729%29.jpg'),
  'Hard Rock Stadium':     wp('/wikipedia/commons/thumb/c/ce/Hard_Rock_Stadium_for_Super_Bowl_LIV_%2849606710103%29.jpg/960px-Hard_Rock_Stadium_for_Super_Bowl_LIV_%2849606710103%29.jpg'),
  'Mercedes-Benz Stadium': wp('/wikipedia/commons/thumb/1/10/Mercedes_Benz_Stadium_time_lapse_capture_2017-08-13.jpg/960px-Mercedes_Benz_Stadium_time_lapse_capture_2017-08-13.jpg'),
  'Lumen Field':           wp('/wikipedia/commons/thumb/9/98/2025_FIFA_Club_World_Cup_-_Seattle_Sounders_FC_vs._Atl%C3%A9tico_Madrid_-_05.jpg/960px-2025_FIFA_Club_World_Cup_-_Seattle_Sounders_FC_vs._Atl%C3%A9tico_Madrid_-_05.jpg'),
  'Gillette Stadium':      wp('/wikipedia/commons/thumb/d/db/Gillette_Stadium_%28Top_View%29.jpg/960px-Gillette_Stadium_%28Top_View%29.jpg'),
  'NRG Stadium':           wp('/wikipedia/commons/thumb/3/3e/Nrg_stadium.jpg/960px-Nrg_stadium.jpg'),
  'Arrowhead Stadium':     wp('/wikipedia/commons/thumb/a/ac/Aerial_view_of_Arrowhead_Stadium_08-31-2013.jpg/960px-Aerial_view_of_Arrowhead_Stadium_08-31-2013.jpg'),
  'Lincoln Financial Field':wp('/wikipedia/commons/thumb/a/a1/Lincoln_Financial_Field_%28Aerial_view%29.jpg/960px-Lincoln_Financial_Field_%28Aerial_view%29.jpg'),
  'BMO Field':             wp('/wikipedia/commons/thumb/9/91/Toronto_BMO_Field_in_2024.jpg/960px-Toronto_BMO_Field_in_2024.jpg'),
  'BC Place':              wp('/wikipedia/commons/thumb/f/ff/BC_Place_2015_Women%27s_FIFA_World_Cup.jpg/960px-BC_Place_2015_Women%27s_FIFA_World_Cup.jpg'),
  'Estadio Azteca':        wp('/wikipedia/commons/thumb/0/07/Vista_a%C3%A9rea_del_Estadio_Azteca_-_2026_-_02.jpg/960px-Vista_a%C3%A9rea_del_Estadio_Azteca_-_2026_-_02.jpg'),
  'Estadio Akron':         wp('/wikipedia/commons/thumb/1/10/Estadio_Akron_02-07-2022_cabecera_sur_lado_derecho_%283%29.jpg/960px-Estadio_Akron_02-07-2022_cabecera_sur_lado_derecho_%283%29.jpg'),
  'Estadio BBVA':          wp('/wikipedia/commons/thumb/5/57/Mexico_Guadalupe_Monterrey_Estadio_BBVA_Bancomer_fifa_world_cup_2026_6.JPG/960px-Mexico_Guadalupe_Monterrey_Estadio_BBVA_Bancomer_fifa_world_cup_2026_6.JPG'),
};

const CITY_PHOTOS = {
  'New York / New Jersey': wp('/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/960px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg'),
  'Los Angeles':           wp('/wikipedia/commons/thumb/5/5a/Hollywood_Sign_%28Zuschnitt%29.jpg/960px-Hollywood_Sign_%28Zuschnitt%29.jpg'),
  'Dallas':                wp('/wikipedia/commons/thumb/0/03/View_of_Dallas_from_Reunion_Tower_August_2015_05.jpg/960px-View_of_Dallas_from_Reunion_Tower_August_2015_05.jpg'),
  'San Francisco Bay Area':wp('/wikipedia/commons/thumb/f/f9/San_Francisco_Downtown_Aerial%2C_August_2025.jpg/960px-San_Francisco_Downtown_Aerial%2C_August_2025.jpg'),
  'Miami':                 wp('/wikipedia/commons/thumb/2/25/Villa_Vizcaya_20110228.jpg/960px-Villa_Vizcaya_20110228.jpg'),
  'Atlanta':               wp('/wikipedia/commons/thumb/c/c8/A2ATL20250614-0721_%28cropped%29.jpg/960px-A2ATL20250614-0721_%28cropped%29.jpg'),
  'Seattle':               wp('/wikipedia/commons/thumb/5/58/Seattle_Center_as_night_falls.jpg/960px-Seattle_Center_as_night_falls.jpg'),
  'Boston':                wp('/wikipedia/commons/thumb/9/96/ISH_WC_Boston4.jpg/960px-ISH_WC_Boston4.jpg'),
  'Houston':               wp('/wikipedia/commons/thumb/a/a3/Texas_medical_center.jpg/960px-Texas_medical_center.jpg'),
  'Kansas City':           wp('/wikipedia/commons/thumb/7/79/Kansas_City_-_Downtown_-_panoramio_%2815%29.jpg/960px-Kansas_City_-_Downtown_-_panoramio_%2815%29.jpg'),
  'Philadelphia':          wp('/wikipedia/commons/thumb/1/19/Philadelphia_skyline_20240528_%28cropped_2-1%29.jpg/960px-Philadelphia_skyline_20240528_%28cropped_2-1%29.jpg'),
  'Toronto':               wp('/wikipedia/commons/thumb/1/1c/Toronto_Skyline_from_Snake_Island%2C_February_28_2026_%2808%29.jpg/960px-Toronto_Skyline_from_Snake_Island%2C_February_28_2026_%2808%29.jpg'),
  'Vancouver':             wp('/wikipedia/commons/thumb/3/33/Skyline_of_Vancouver%2C_Canada.jpg/960px-Skyline_of_Vancouver%2C_Canada.jpg'),
  'Mexico City':           wp('/wikipedia/commons/thumb/4/4f/Sobrevuelos_CDMX_HJ2A4913_%2825514321687%29_%28cropped%29.jpg/960px-Sobrevuelos_CDMX_HJ2A4913_%2825514321687%29_%28cropped%29.jpg'),
  'Guadalajara':           wp('/wikipedia/commons/thumb/3/38/Panor%C3%A1mica_Guadalajara_desde_edificio_Bansi_hacia_norte_%28cropped%29.jpg/960px-Panor%C3%A1mica_Guadalajara_desde_edificio_Bansi_hacia_norte_%28cropped%29.jpg'),
  'Monterrey':             wp('/wikipedia/commons/thumb/d/de/View_of_Monterrey_%282015%29.jpg/960px-View_of_Monterrey_%282015%29.jpg'),
};

// ── Host cities ───────────────────────────────────────────────────────────
const HOST_CITIES = [
  { city:'New York / New Jersey', country:'USA', flag:'🇺🇸', stadium:'MetLife Stadium', capacity:82500, matches:8, coords:[40.8135,-74.0745], highlight:'Hosts the World Cup Final', description:'The world\'s media capital hosts the biggest game on Earth. MetLife Stadium sits in the New Jersey Meadowlands, minutes from Manhattan via NJ Transit.', transport:'🚂 NJ Transit from Penn Station (20 min) · ⛴ NY Waterway ferry from Midtown', tourist:[{name:'Times Square',emoji:'🌟',note:'Neon heart of the world'},{name:'Central Park',emoji:'🌳',note:'843 acres in midtown Manhattan'},{name:'Statue of Liberty',emoji:'🗽',note:'Ferry from Battery Park'},{name:'Brooklyn Bridge',emoji:'🌉',note:'Walk across for skyline views'},{name:'MoMA / Met Museum',emoji:'🎨',note:'World-class art collections'}] },
  { city:'Los Angeles', country:'USA', flag:'🇺🇸', stadium:'SoFi Stadium', capacity:70240, matches:8, coords:[33.9535,-118.3392], highlight:'Hosts the Opening Ceremony', description:'Hollywood glamour meets world football. SoFi Stadium in Inglewood is one of the most technologically advanced venues ever built, featuring a translucent roof.', transport:'🚌 LAX Shuttle + Uber/Lyft · Ride-share strongly recommended — LA traffic is legendary', tourist:[{name:'Hollywood Walk of Fame',emoji:'⭐',note:'Hollywood Blvd'},{name:'Santa Monica Pier',emoji:'🎡',note:'Pacific Ocean views'},{name:'Griffith Observatory',emoji:'🔭',note:'Free, iconic LA views'},{name:'Getty Center',emoji:'🖼',note:'Free museum with gardens'},{name:'Venice Beach',emoji:'🏄',note:'Boardwalk, skate park'}] },
  { city:'Dallas', country:'USA', flag:'🇺🇸', stadium:'AT&T Stadium', capacity:80000, matches:7, coords:[32.7473,-97.0945], highlight:'Largest seating capacity in the tournament', description:'AT&T Stadium in Arlington is known as "Jerry World" — a cathedral of American sport with a retractable roof and massive video boards.', transport:'🚗 Primarily car/rideshare · Trinity Railway Express from downtown Dallas', tourist:[{name:'Sixth Floor Museum',emoji:'📖',note:'JFK assassination history, Dealey Plaza'},{name:'Deep Ellum',emoji:'🎵',note:'Legendary music and food district'},{name:'Reunion Tower',emoji:'🗼',note:'GeO-Deck 360° views'},{name:'Fort Worth Stockyards',emoji:'🤠',note:'30 min from Dallas — true Texas'}] },
  { city:'San Francisco Bay Area', country:'USA', flag:'🇺🇸', stadium:"Levi's Stadium", capacity:68500, matches:6, coords:[37.4034,-121.9697], highlight:'Silicon Valley meets world football', description:'Levi\'s Stadium in Santa Clara hosts World Cup matches in the heart of Silicon Valley.', transport:'🚇 VTA Light Rail from Santa Clara Station · 🚂 Caltrain to nearby stops', tourist:[{name:'Golden Gate Bridge',emoji:'🌉',note:'Walk or bike across'},{name:'Alcatraz Island',emoji:'⚓',note:'Book ferry tickets weeks ahead'},{name:'Fisherman\'s Wharf',emoji:'🦀',note:'Clam chowder in sourdough bowls'},{name:'Napa Valley',emoji:'🍷',note:'World-famous wine country, 1hr north'}] },
  { city:'Miami', country:'USA', flag:'🇺🇸', stadium:'Hard Rock Stadium', capacity:64767, matches:6, coords:[25.9580,-80.2389], highlight:'Tropical World Cup vibes', description:'Hard Rock Stadium in Miami Gardens brings tropical energy to the World Cup. Miami\'s Latin culture creates a uniquely festive atmosphere.', transport:'🚗 Mainly rideshare · Tri-Rail from downtown Miami', tourist:[{name:'South Beach',emoji:'🏖',note:'Art Deco District + Ocean Drive'},{name:'Wynwood Walls',emoji:'🎨',note:'World-famous street art district'},{name:'Little Havana',emoji:'🎺',note:'Calle Ocho, dominos, Cuban food'},{name:'Everglades',emoji:'🐊',note:'Airboat tours, 45 min away'}] },
  { city:'Atlanta', country:'USA', flag:'🇺🇸', stadium:'Mercedes-Benz Stadium', capacity:71000, matches:6, coords:[33.7554,-84.4010], highlight:'Home of the 1994 World Cup and Olympics', description:'Mercedes-Benz Stadium\'s retractable petal roof is an engineering marvel. Atlanta\'s rich civil rights history makes it a unique destination.', transport:'🚇 MARTA Rail (Blue/Green) to Vine City or GWCC/CNN Center', tourist:[{name:'MLK National Historic Site',emoji:'✊',note:'Civil rights pilgrimage, must-visit'},{name:'Georgia Aquarium',emoji:'🐋',note:'World\'s largest aquarium'},{name:'World of Coca-Cola',emoji:'🥤',note:'Iconic brand museum'},{name:'Centennial Olympic Park',emoji:'🏅',note:'Legacy of 1996 Summer Olympics'}] },
  { city:'Seattle', country:'USA', flag:'🇺🇸', stadium:'Lumen Field', capacity:69000, matches:6, coords:[47.5952,-122.3316], highlight:'One of the loudest stadiums on Earth', description:'Lumen Field, legendary for deafening crowd noise, sits in SODO with views of Elliott Bay and the Olympic Mountains.', transport:'🚊 Link Light Rail (1st & King/International Dist station, 10 min walk)', tourist:[{name:'Pike Place Market',emoji:'🐟',note:'Fish-throwing since 1907'},{name:'Space Needle',emoji:'🛸',note:'1962 World\'s Fair icon'},{name:'Mount Rainier',emoji:'🏔',note:'14,411 ft volcano, 2hr drive'},{name:'Capitol Hill',emoji:'🎸',note:'Music bars, coffee, culture'}] },
  { city:'Boston', country:'USA', flag:'🇺🇸', stadium:'Gillette Stadium', capacity:65878, matches:6, coords:[42.0909,-71.2643], highlight:'America\'s most historic city', description:'Gillette Stadium in Foxborough brings the World Cup to New England, home of some of the most passionate sports fans in America.', transport:'🚂 Commuter Rail from South Station (40 min) on game days', tourist:[{name:'Freedom Trail',emoji:'🏛',note:'16 historic sites, 2.5 mile walk'},{name:'Fenway Park',emoji:'⚾',note:'Oldest MLB ballpark, tours available'},{name:'Harvard & MIT',emoji:'🎓',note:'Free campus walks in Cambridge'},{name:'Cape Cod',emoji:'🦞',note:'Lobster rolls and beaches, 90 min'}] },
  { city:'Houston', country:'USA', flag:'🇺🇸', stadium:'NRG Stadium', capacity:72220, matches:6, coords:[29.6847,-95.4107], highlight:'Space City hosts the world', description:'NRG Stadium pioneered the retractable roof concept. Houston\'s extraordinary diversity — 145 languages spoken — gives it one of the most vibrant fan cultures.', transport:'🚇 METRORail Red Line to Reliant Park Station', tourist:[{name:'NASA Johnson Space Center',emoji:'🚀',note:'See a real Saturn V rocket'},{name:'Museum District',emoji:'🏛',note:'Free Thursdays at many museums'},{name:'Buffalo Bayou Park',emoji:'🌿',note:'Urban oasis in the heart of the city'},{name:'Galveston Island',emoji:'🏝',note:'Beach + historic downtown, 1hr'}] },
  { city:'Kansas City', country:'USA', flag:'🇺🇸', stadium:'Arrowhead Stadium', capacity:76416, matches:6, coords:[39.0489,-94.4839], highlight:'BBQ capital meets the beautiful game', description:'Arrowhead Stadium, one of the NFL\'s crown jewels. Kansas City BBQ is reason enough to visit.', transport:'🚗 Mainly rideshare from downtown KC (25 min)', tourist:[{name:'Kansas City BBQ',emoji:'🍖',note:'Arthur Bryant\'s, Joe\'s, Gates — debate is eternal'},{name:'Country Club Plaza',emoji:'🏰',note:'Spanish-style outdoor shopping'},{name:'Nelson-Atkins Museum',emoji:'🖼',note:'Free world-class art collection'},{name:'Jazz District',emoji:'🎷',note:'KC invented American jazz'}] },
  { city:'Philadelphia', country:'USA', flag:'🇺🇸', stadium:'Lincoln Financial Field', capacity:69176, matches:6, coords:[39.9007,-75.1674], highlight:'City of Brotherly Love', description:'Philadelphia hosted the first international soccer game in US history. "The Linc" sits in South Philly\'s sports complex.', transport:'🚇 SEPTA Broad Street Line to AT&T Station (10 min walk)', tourist:[{name:'Independence Hall & Liberty Bell',emoji:'🔔',note:'Birthplace of American democracy'},{name:'Rocky Steps at the Art Museum',emoji:'🥊',note:'Run them. You must.'},{name:'Reading Terminal Market',emoji:'🥨',note:'Best cheesesteaks and soft pretzels'},{name:'Eastern State Penitentiary',emoji:'👻',note:'Hauntingly beautiful ruin'}] },
  { city:'Toronto', country:'Canada', flag:'🇨🇦', stadium:'BMO Field', capacity:30000, matches:6, coords:[43.6333,-79.4186], highlight:'Canada\'s largest city hosts its first World Cup', description:'BMO Field on the Lake Ontario waterfront is Canada\'s premier football stadium. Toronto\'s incredible multiculturalism creates an electrifying atmosphere.', transport:'🚌 TTC 509/511 streetcar from Union Station · 🚶 20 min walk from Exhibition GO Station', tourist:[{name:'CN Tower',emoji:'🗼',note:'Glass floor EdgeWalk experience'},{name:'Niagara Falls',emoji:'💧',note:'Under 2 hours by car — absolutely do it'},{name:'Kensington Market',emoji:'🌍',note:'Bohemian neighbourhood, world food'},{name:'Distillery District',emoji:'🥃',note:'Victorian industrial art + dining'}] },
  { city:'Vancouver', country:'Canada', flag:'🇨🇦', stadium:'BC Place', capacity:54500, matches:6, coords:[49.2768,-123.1118], highlight:'Mountains meet ocean — most scenic venue', description:'BC Place\'s retractable roof and mountain backdrop make it one of the most beautiful venues in world football.', transport:'🚇 SkyTrain Expo/Millennium to Stadium-Chinatown (direct)', tourist:[{name:'Stanley Park',emoji:'🌲',note:'1,000-acre forest on ocean peninsula'},{name:'Granville Island',emoji:'🎨',note:'Public market + artisan studios'},{name:'Whistler',emoji:'⛷',note:'2hr north — world\'s best ski resort'},{name:'Grouse Mountain',emoji:'🏔',note:'Gondola + city views, 30 min'}] },
  { city:'Mexico City', country:'Mexico', flag:'🇲🇽', stadium:'Estadio Azteca', capacity:87523, matches:5, coords:[19.3029,-99.1506], highlight:'Only stadium to host 3 World Cup finals (1970, 1986, 2026)', description:'The legendary Azteca — where Pelé lifted the trophy in 1970 and Maradona\'s "Hand of God" happened in 1986 — roars again at 7,350 ft altitude.', transport:'🚇 Metro Line 2 to Tasqueña, then Tren Ligero to Estadio Azteca', tourist:[{name:'Teotihuacan Pyramids',emoji:'🏛',note:'30 mi northeast — climb the Pyramid of the Sun'},{name:'Frida Kahlo Museum',emoji:'🎨',note:'La Casa Azul in Coyoacán'},{name:'Chapultepec Castle',emoji:'🏰',note:'Hilltop castle with city views'},{name:'Xochimilco',emoji:'🚣',note:'Ancient floating gardens by trajinera'}] },
  { city:'Guadalajara', country:'Mexico', flag:'🇲🇽', stadium:'Estadio Akron', capacity:49850, matches:5, coords:[20.6858,-103.4669], highlight:'Tequila, mariachi & the beautiful game', description:'Estadio Akron (Chivas Stadium) is shaped like a volcano. Guadalajara is the birthplace of mariachi music and tequila.', transport:'🚌 SITEUR light rail + bus connections from city center', tourist:[{name:'Hospicio Cabañas',emoji:'🎨',note:'UNESCO site — Orozco murals'},{name:'Tlaquepaque',emoji:'🛍',note:'Artisan crafts and mezcal bars'},{name:'Tequila Town',emoji:'🥃',note:'1hr drive — distillery tours'},{name:'Guadalajara Cathedral',emoji:'⛪',note:'Twin-spired 16th century masterpiece'}] },
  { city:'Monterrey', country:'Mexico', flag:'🇲🇽', stadium:'Estadio BBVA', capacity:53500, matches:5, coords:[25.6693,-100.2437], highlight:'Mountain backdrop like no other', description:'Estadio BBVA is framed by the dramatic Sierra Madre Oriental mountains, creating one of world football\'s most striking visual settings.', transport:'🚇 Metro Line 2 + bus connections · shuttle buses on match days', tourist:[{name:'Macroplaza',emoji:'🏛',note:'One of the world\'s largest public squares'},{name:'Parque Fundidora',emoji:'🏭',note:'Former steel mill turned beautiful park'},{name:'Barrio Antiguo',emoji:'🎶',note:'Bohemian bars, galleries, nightlife'},{name:'Cola de Caballo',emoji:'💧',note:'Stunning waterfall, 1hr from city'}] },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function matchLocalTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function matchLocalDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function toast(msg, type = 'info') {
  const tc = document.querySelector('.toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  tc.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function getKey() { return localStorage.getItem('claude_api_key') || ''; }

function mlToStr(ml) {
  if (ml == null) return '–';
  return ml > 0 ? `+${ml}` : `${ml}`;
}

// ── Match card HTML ───────────────────────────────────────────────────────
function matchCardHTML(m, clickable = true) {
  const statusCls = m.status === 'in' ? 'status-live' : m.status === 'post' ? 'status-ft' : 'status-ns';
  const statusLbl = m.status === 'in'   ? (m.clock || 'LIVE')
                  : m.status === 'post' ? 'FT'
                  : matchLocalTime(m.date);
  const roundLabel = [m.round, m.group].filter(Boolean).join(' · ');
  const hasScore = m.home?.score !== null && m.away?.score !== null && m.status !== 'pre';
  const click = clickable ? `onclick="showMatchDetail('${m.id}')"` : '';
  return `<div class="card match-card" ${click} style="${clickable ? 'cursor:pointer' : ''}">
    <div class="match-status">
      <span class="status-badge ${statusCls}">${statusLbl}</span>
      <span class="match-time">${matchLocalDate(m.date)}</span>
    </div>
    ${roundLabel ? `<div class="match-round">${roundLabel}</div>` : ''}
    <div class="match-teams">
      <div class="team"><span class="team-flag">${m.away?.flag || '⚽'}</span><span class="team-name">${m.away?.name || '?'}</span></div>
      <div class="match-score">
        <div class="score-main">${hasScore ? `${m.away?.score}<span class="score-sep"> – </span>${m.home?.score}` : `<span style="color:var(--text-dim);font-size:0.95rem">vs</span>`}</div>
      </div>
      <div class="team"><span class="team-flag">${m.home?.flag || '⚽'}</span><span class="team-name">${m.home?.name || '?'}</span></div>
    </div>
    ${m.venue ? `<div class="match-venue">📍 ${m.venue}</div>` : ''}
  </div>`;
}

// ── Render: Scores ────────────────────────────────────────────────────────
function renderScores() {
  const el = $('scores-container');
  const live  = state.matches.filter(m => m.status === 'in');
  const other = state.matches.filter(m => m.status !== 'in');
  if (!state.matches.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">⚽</span><span>No matches today — check the Schedule tab for upcoming fixtures.</span></div>`;
    return;
  }
  let html = '';
  if (live.length)  html += `<div class="scores-section-label live-label">🔴 Live Now</div><div class="scores-grid" style="margin-bottom:1.5rem">${live.map(m => matchCardHTML(m)).join('')}</div>`;
  if (other.length) html += `<div class="scores-section-label">📅 Today's Matches</div><div class="scores-grid">${other.map(m => matchCardHTML(m)).join('')}</div>`;
  el.innerHTML = html;
  $('live-count').textContent = live.length ? `${live.length} LIVE` : 'LIVE';
}

// ── Render: Standings ─────────────────────────────────────────────────────
function renderStandings() {
  const el = $('standings-container');
  if (!state.standings.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">📊</span><span>Loading standings — tournament begins Jun 11, 2026.</span></div>`;
    return;
  }
  const maxPtsAll = Math.max(...state.standings.flatMap(g => g.entries.map(e => e.pts)), 1);
  el.innerHTML = `<div class="groups-grid">${state.standings.map(g => {
    const maxPts = Math.max(...g.entries.map(e => e.pts), 1);
    return `<div class="card group-card">
      <div class="group-name">${g.name}</div>
      <table class="standings-table">
        <thead><tr><th style="width:45%">Team</th><th>MP</th><th class="col-hide-mobile">W</th><th class="col-hide-mobile">D</th><th class="col-hide-mobile">L</th><th class="col-hide-mobile">GD</th><th>Pts</th><th class="col-hide-mobile" style="min-width:60px"></th></tr></thead>
        <tbody>${g.entries.map((e, i) => `
          <tr class="${i < 2 ? 'row-qualify' : ''}" onclick="showTeamDetail('${e.name}')" style="cursor:pointer">
            <td><div class="team-row">
              <span class="team-pos ${i < 2 ? 'qualified' : i === 2 ? 'promoted' : ''}">${e.pos}</span>
              <span class="team-flag-sm">${e.flag}</span>
              <span class="team-name-sm">${e.name}</span>
            </div></td>
            <td>${e.gp}</td>
            <td class="col-hide-mobile">${e.w}</td>
            <td class="col-hide-mobile">${e.d}</td>
            <td class="col-hide-mobile">${e.l}</td>
            <td class="col-hide-mobile">${e.gd > 0 ? '+' : ''}${e.gd}</td>
            <td><strong>${e.pts}</strong></td>
            <td class="col-hide-mobile"><div class="pts-bar-wrap"><div class="pts-bar ${i < 2 ? 'pts-bar-qualify' : ''}" style="width:${Math.round((e.pts/maxPts)*100)}%"></div></div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('')}</div>`;
  renderGoalsViz();
}

function renderGoalsViz() {
  const el = $('goals-viz');
  if (!el || !state.standings.length) return;
  const data = state.standings.map(g => ({ name: g.name.replace('Group ',''), goals: g.entries.reduce((s,e) => s + (e.gf||0), 0) }));
  const maxG = Math.max(...data.map(g => g.goals), 1);
  const total = data.reduce((s,g) => s + g.goals, 0);
  if (total === 0) return;
  el.innerHTML = `<div class="card" style="margin-top:1.25rem">
    <div class="viz-title">Goals Scored by Group</div>
    <div class="bar-chart">${data.map(g => `
      <div class="bar-row"><div class="bar-label">Grp ${g.name}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round((g.goals/maxG)*100)}%"></div></div><div class="bar-val">${g.goals}</div></div>`).join('')}
    </div>
    <div class="viz-sub">Total goals scored so far: <strong>${total}</strong> · Avg: <strong>${(total / Math.max(state.standings.flatMap(g=>g.entries).reduce((s,e)=>s+e.gp,0)/2,1)).toFixed(2)}</strong> per match</div>
  </div>`;
}

// ── Render: Schedule ──────────────────────────────────────────────────────
function renderSchedule() {
  const el = $('schedule-container');
  if (!state.schedule.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">📅</span><span>Loading full tournament schedule…</span></div>`;
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const byDate = {};
  for (const m of state.schedule) {
    const d = matchLocalDate(m.date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(m);
  }
  el.innerHTML = Object.entries(byDate).map(([date, ms]) => {
    const matchDate = new Date(ms[0].date); matchDate.setHours(0,0,0,0);
    const isToday = matchDate.getTime() === today.getTime();
    const isPast  = matchDate < today;
    return `<div style="margin-bottom:1.75rem">
      <div class="schedule-day-header ${isToday ? 'today' : isPast ? 'past' : ''}">${isToday ? '📍 Today' : date}</div>
      <div class="scores-grid">${ms.map(m => matchCardHTML(m, true)).join('')}</div>
    </div>`;
  }).join('');
}

// ── Render: Teams ─────────────────────────────────────────────────────────
function renderTeams() {
  const el = $('teams-container');
  const teamMap = {};
  for (const m of [...state.schedule, ...state.matches]) {
    for (const side of [m.home, m.away]) {
      if (side?.name && !teamMap[side.name]) teamMap[side.name] = { name: side.name, flag: side.flag, group: m.group || '', abbr: side.abbr || '' };
    }
  }
  for (const g of state.standings) {
    for (const e of g.entries) {
      if (!teamMap[e.name]) teamMap[e.name] = { name: e.name, flag: e.flag, group: g.name, abbr: e.abbr };
      else if (!teamMap[e.name].group) teamMap[e.name].group = g.name;
    }
  }
  const teams = Object.values(teamMap).sort((a,b) => a.name.localeCompare(b.name));
  if (!teams.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">🌍</span><span>Loading teams…</span></div>`;
    return;
  }
  $('stat-teams').textContent = teams.length || 48;
  const byGroup = {};
  for (const t of teams) {
    if (t.group) { if (!byGroup[t.group]) byGroup[t.group] = []; byGroup[t.group].push(t); }
  }
  let html = `<div class="teams-summary">
    <div class="info-card"><div class="info-val">${teams.length}</div><div class="info-lbl">Nations</div></div>
    <div class="info-card"><div class="info-val">12</div><div class="info-lbl">Groups</div></div>
    <div class="info-card"><div class="info-val">3</div><div class="info-lbl">Host Nations</div></div>
    <div class="info-card"><div class="info-val">6</div><div class="info-lbl">Confederations</div></div>
  </div>`;
  if (Object.keys(byGroup).length) {
    const sorted = Object.entries(byGroup).sort(([a],[b]) => a.localeCompare(b));
    html += `<div class="groups-grid">${sorted.map(([grp, ts]) => {
      const gs = state.standings.find(s => s.name === grp);
      return `<div class="card group-card"><div class="group-name">${grp}</div>
        ${ts.map(t => {
          const st = gs?.entries?.find(e => e.name === t.name);
          return `<div class="team-list-row" onclick="showTeamDetail('${t.name}')" style="cursor:pointer">
            <span style="font-size:1.25rem">${t.flag}</span>
            <span style="flex:1;font-size:0.87rem">${t.name}</span>
            ${st ? `<span style="font-size:0.7rem;color:var(--text-dim)">${st.gp}GP · <strong style="color:var(--text)">${st.pts}pts</strong></span>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}</div>`;
  } else {
    html += `<div class="teams-grid">${teams.map(t => `<div class="card team-card" onclick="showTeamDetail('${t.name}')" style="cursor:pointer"><div class="team-card-flag">${t.flag}</div><div class="team-card-name">${t.name}</div></div>`).join('')}</div>`;
  }
  el.innerHTML = html;
}

// ── Render: Cities ────────────────────────────────────────────────────────
function renderCities() {
  const el = $('cities-container');
  const byCountry = {};
  for (const c of HOST_CITIES) {
    if (!byCountry[c.country]) byCountry[c.country] = [];
    byCountry[c.country].push(c);
  }
  const totalCap = HOST_CITIES.reduce((s,c) => s + c.capacity, 0);
  el.innerHTML = `<div class="teams-summary">
    <div class="info-card"><div class="info-val">16</div><div class="info-lbl">Host Cities</div></div>
    <div class="info-card"><div class="info-val">3</div><div class="info-lbl">Host Nations</div></div>
    <div class="info-card"><div class="info-val">${(totalCap/1e6).toFixed(1)}M</div><div class="info-lbl">Total Capacity</div></div>
    <div class="info-card"><div class="info-val">104</div><div class="info-lbl">Total Matches</div></div>
  </div>
  ${Object.entries(byCountry).map(([country, cities]) => `
    <div style="margin-bottom:2rem">
      <div class="scores-section-label">${cities[0].flag} ${country} — ${cities.length} cities</div>
      <div class="cities-grid">${cities.map(c => {
        const photo = CITY_PHOTOS[c.city] || STADIUM_PHOTOS[c.stadium] || '';
        return `<div class="card city-card" onclick="showCityDetail('${c.city}')" style="cursor:pointer">
          <div class="city-photo-wrap">
            ${photo ? `<img class="city-photo-img" src="${photo}" alt="${c.city}" loading="lazy" onerror="this.style.display='none'">` : ''}
            <div class="city-photo-flag">${c.flag}</div>
          </div>
          <div class="city-info">
            <div class="city-name">${c.city}</div>
            <div class="city-stadium">${c.stadium}</div>
            ${c.highlight ? `<div style="font-size:0.7rem;color:var(--gold);opacity:0.75;margin-bottom:0.35rem">★ ${c.highlight}</div>` : ''}
            <div class="city-meta"><span>🏟 ${c.capacity.toLocaleString()}</span><span>⚽ ${c.matches} matches</span></div>
          </div>
        </div>`;
      }).join('')}
      </div>
    </div>`).join('')}`;
}

// ── Live tournament stats (aggregated from match key events) ─────────────
// Cache for aggregated scorer/card data
const liveStats = { scorers: {}, yellowCards: {}, redCards: {}, loaded: false };

async function fetchLiveTournamentStats() {
  const completed = state.schedule.filter(m => m.status === 'post');
  if (!completed.length) return;
  const summaries = await Promise.allSettled(completed.map(m => fetchMatchSummary(m.id)));
  for (const [i, result] of summaries.entries()) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const { keyEvents = [], teamStats } = result.value;
    const m = completed[i];
    for (const ev of keyEvents) {
      if (!ev.athlete) continue;
      const teamName = ev.ha === 'home' ? m.home?.name : m.away?.name;
      if (ev.kind === 'goal') {
        const key = ev.athlete;
        if (!liveStats.scorers[key]) liveStats.scorers[key] = { name: ev.athlete, goals: 0, team: teamName };
        liveStats.scorers[key].goals++;
      } else if (ev.kind === 'yellow') {
        const key = teamName || 'Unknown';
        liveStats.yellowCards[key] = (liveStats.yellowCards[key] || 0) + 1;
      } else if (ev.kind === 'red') {
        const key = teamName || 'Unknown';
        liveStats.redCards[key] = (liveStats.redCards[key] || 0) + 1;
      }
    }
  }
  liveStats.loaded = true;
  if ($('stats-container')) renderStats();
}

// ── Render: Statistics ────────────────────────────────────────────────────
function renderStats() {
  const el = $('stats-container');
  if (!el) return;

  // Live 2026 stats from schedule data
  const played = state.schedule.filter(m => m.status === 'post').length;
  const totalGoals = state.standings.reduce((s,g) => s + g.entries.reduce((gs,e) => gs + (e.gf||0), 0), 0);
  const avgGPG = played > 0 ? (totalGoals / played).toFixed(2) : '–';
  const remaining = 104 - played;

  // Goals per tournament chart (last 8)
  const chartData = WC_HISTORY.slice(0, 8).reverse();
  const maxHistGoals = Math.max(...chartData.map(t => t.goals));

  // Build live team stat tables from standings
  const allEntries = state.standings.flatMap(g => g.entries.map(e => ({...e, group: g.name})));
  const topScorers = allEntries.filter(e => e.gf > 0).sort((a,b) => b.gf - a.gf).slice(0,10);
  const bestDefense = allEntries.filter(e => e.gp > 0).sort((a,b) => a.ga - b.ga || b.gp - a.gp).slice(0,8);
  const cleanSheets = allEntries.filter(e => e.gp > 0 && e.ga === 0).sort((a,b) => b.gp - a.gp);
  const topWinRate  = allEntries.filter(e => e.gp > 0).sort((a,b) => (b.w/b.gp) - (a.w/a.gp) || b.pts - a.pts).slice(0,8);
  const maxGoals    = topScorers[0]?.gf || 1;

  // Scorer leaders from key events
  const scorerList = Object.values(liveStats.scorers).sort((a,b) => b.goals - a.goals).slice(0,10);
  const yellowList  = Object.entries(liveStats.yellowCards).sort((a,b) => b[1]-a[1]).slice(0,8);
  const redList     = Object.entries(liveStats.redCards).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxYellow   = yellowList[0]?.[1] || 1;
  const totalYellow = Object.values(liveStats.yellowCards).reduce((s,v) => s+v, 0);
  const totalRed    = Object.values(liveStats.redCards).reduce((s,v) => s+v, 0);

  el.innerHTML = `
  <!-- Live 2026 overview -->
  <div class="stats-overview">
    <div class="stat-hero-card"><div class="stat-hero-val">${played}</div><div class="stat-hero-lbl">Matches Played</div></div>
    <div class="stat-hero-card"><div class="stat-hero-val">${totalGoals}</div><div class="stat-hero-lbl">Goals Scored</div></div>
    <div class="stat-hero-card"><div class="stat-hero-val">${avgGPG}</div><div class="stat-hero-lbl">Goals / Match</div></div>
    <div class="stat-hero-card"><div class="stat-hero-val">${remaining}</div><div class="stat-hero-lbl">Matches Remaining</div></div>
    <div class="stat-hero-card"><div class="stat-hero-val">48</div><div class="stat-hero-lbl">Nations Competing</div></div>
    <div class="stat-hero-card"><div class="stat-hero-val">104</div><div class="stat-hero-lbl">Total Matches</div></div>
  </div>

  <!-- Live 2026 team stats -->
  ${topScorers.length ? `<div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">⚽ Top Goal-Scoring Teams — WC 2026</div>
    ${topScorers.map(e => `<div class="bar-row" style="margin-bottom:0.4rem">
      <div style="width:120px;font-size:0.78rem;color:var(--text);display:flex;align-items:center;gap:0.35rem">${e.flag} ${e.name}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((e.gf/maxGoals)*100)}%;background:var(--green)"></div></div>
      <div class="bar-val">${e.gf} <span style="font-size:0.65rem;color:var(--text-dim)">(${e.gp}GP)</span></div>
    </div>`).join('')}
  </div>` : ''}

  ${bestDefense.length ? `<div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">🛡 Best Defenses — Fewest Goals Conceded</div>
    ${bestDefense.map(e => `<div class="bar-row" style="margin-bottom:0.4rem">
      <div style="width:120px;font-size:0.78rem;color:var(--text);display:flex;align-items:center;gap:0.35rem">${e.flag} ${e.name}</div>
      <div style="font-size:0.78rem;font-weight:600;color:${e.ga===0?'var(--green)':'var(--text)'};width:32px">${e.ga} GA</div>
      ${e.ga === 0 ? `<span style="font-size:0.7rem;color:var(--green)">✓ Clean sheet${e.gp>1?'s':''}</span>` : ''}
    </div>`).join('')}
    ${cleanSheets.length ? `<div style="margin-top:0.5rem;font-size:0.72rem;color:var(--text-dim)">🧤 Clean sheets: ${cleanSheets.map(e => `${e.flag} ${e.name}`).join(' · ')}</div>` : ''}
  </div>` : ''}

  ${topWinRate.length ? `<div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">📈 Win Rate — Teams in Form</div>
    ${topWinRate.map(e => {
      const wr = e.gp > 0 ? Math.round((e.w/e.gp)*100) : 0;
      return `<div class="bar-row" style="margin-bottom:0.4rem">
        <div style="width:120px;font-size:0.78rem;color:var(--text);display:flex;align-items:center;gap:0.35rem">${e.flag} ${e.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${wr}%;background:var(--gold)"></div></div>
        <div class="bar-val">${wr}%<span style="font-size:0.65rem;color:var(--text-dim);margin-left:4px">${e.w}W-${e.d}D-${e.l}L</span></div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <!-- Goal scorers from live match data -->
  ${liveStats.loaded ? (scorerList.length ? `<div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">⚽ Top Scorers — WC 2026</div>
    <table class="standings-table">
      <thead><tr><th style="text-align:left;width:40%">Player</th><th>Goals</th><th style="text-align:left" class="col-hide-mobile">Team</th></tr></thead>
      <tbody>${scorerList.map((p,i) => `<tr>
        <td><div class="team-row"><span class="team-pos">${i+1}</span><span style="font-size:0.82rem">${p.name}</span></div></td>
        <td><strong style="color:var(--gold)">${p.goals}</strong></td>
        <td class="col-hide-mobile" style="font-size:0.78rem;color:var(--text-mid)">${p.team || ''}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>` : '') : `<div class="card" style="margin-bottom:1.25rem;text-align:center;padding:1.5rem">
    <div style="font-size:0.82rem;color:var(--text-dim)">⚽ Loading individual scorer data from match events…</div>
  </div>`}

  <!-- Disciplinary stats -->
  ${liveStats.loaded && (totalYellow > 0 || totalRed > 0) ? `<div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">🟨 Disciplinary — WC 2026</div>
    <div class="stats-overview" style="margin-bottom:1rem">
      <div class="stat-hero-card"><div class="stat-hero-val">${totalYellow}</div><div class="stat-hero-lbl">🟨 Yellow Cards</div></div>
      <div class="stat-hero-card"><div class="stat-hero-val">${totalRed}</div><div class="stat-hero-lbl">🟥 Red Cards</div></div>
      <div class="stat-hero-card"><div class="stat-hero-val">${played > 0 ? (totalYellow/played).toFixed(1) : '–'}</div><div class="stat-hero-lbl">Yellows/Match</div></div>
    </div>
    ${yellowList.length ? `<div class="viz-title" style="font-size:0.75rem;margin-bottom:0.5rem">Most Yellows by Team</div>
    ${yellowList.map(([team, count]) => `<div class="bar-row" style="margin-bottom:0.3rem">
      <div style="width:130px;font-size:0.78rem;color:var(--text)">${team}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((count/maxYellow)*100)}%;background:#f0c040"></div></div>
      <div class="bar-val">${count}</div>
    </div>`).join('')}` : ''}
  </div>` : ''}

  <!-- Group standings summary -->
  ${allEntries.length ? `<div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">🏆 Current Group Leaders</div>
    <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
      ${state.standings.map(g => {
        const leader = g.entries[0];
        if (!leader) return '';
        return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;font-size:0.78rem;min-width:160px">
          <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:0.2rem">${g.name}</div>
          <div style="display:flex;align-items:center;gap:0.4rem"><span>${leader.flag}</span><strong>${leader.name}</strong><span style="color:var(--gold);margin-left:auto">${leader.pts}pts</span></div>
        </div>`;
      }).filter(Boolean).join('')}
    </div>
  </div>` : ''}

  <hr style="border:none;border-top:1px solid var(--border);margin:1.5rem 0">
  <div class="scores-section-label" style="margin-bottom:1rem">📚 All-Time World Cup Records</div>

  <!-- Goals trend chart -->
  <div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">Goals per Tournament (Last 8 World Cups)</div>
    <div class="bar-chart">
      ${chartData.map(t => `<div class="bar-row">
        <div class="bar-label">${t.year}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((t.goals/maxHistGoals)*100)}%"></div></div>
        <div class="bar-val">${t.goals}</div>
        <div style="font-size:0.65rem;color:var(--text-dim);width:60px;text-align:right">(${t.gpg}/g)</div>
      </div>`).join('')}
    </div>
    <div class="viz-sub">2026 with 104 matches (vs 64 previously) — projected ~250+ goals if average holds</div>
  </div>

  <!-- Most WC titles -->
  <div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">Most World Cup Titles</div>
    ${WC_TITLES.map(t => `<div class="bar-row" style="margin-bottom:0.55rem">
      <div style="width:100px;font-size:0.8rem;color:var(--text)">${t.flag} ${t.country}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((t.titles/5)*100)}%;background:var(--gold)"></div></div>
      <div class="bar-val" style="width:16px">${t.titles}</div>
      <div style="font-size:0.65rem;color:var(--text-dim);margin-left:0.5rem">${t.years}</div>
    </div>`).join('')}
  </div>

  <!-- All-time top scorers -->
  <div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">All-Time Top WC Scorers</div>
    <div style="overflow-x:auto">
      <table class="standings-table">
        <thead><tr><th style="text-align:left;width:35%">Player</th><th>Goals</th><th class="col-hide-mobile">Country</th><th class="col-hide-mobile">Tournaments</th><th style="text-align:left" class="col-hide-mobile">Note</th></tr></thead>
        <tbody>
          ${ALL_TIME_SCORERS.sort((a,b) => b.goals - a.goals).map((p, i) => `
            <tr>
              <td><div class="team-row"><span class="team-pos">${i+1}</span><span class="team-flag-sm">${p.flag}</span><span style="font-size:0.8rem">${p.name}</span></div></td>
              <td><strong>${p.goals}</strong></td>
              <td class="col-hide-mobile" style="font-size:0.78rem;color:var(--text-mid)">${p.country}</td>
              <td class="col-hide-mobile" style="font-size:0.73rem;color:var(--text-dim)">${p.years}</td>
              <td class="col-hide-mobile" style="font-size:0.7rem;color:var(--text-dim);text-align:left">${p.note}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- World Cup records -->
  <div class="card" style="margin-bottom:1.25rem">
    <div class="viz-title">Records & Milestones</div>
    <div class="records-grid">
      ${WC_RECORDS.map(r => `<div class="record-card">
        <div class="record-icon">${r.icon}</div>
        <div><div class="record-label">${r.label}</div><div class="record-value">${r.value}</div></div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Full history table -->
  <div class="card">
    <div class="viz-title">Complete World Cup History (1930–2022)</div>
    <div style="overflow-x:auto">
      <table class="standings-table">
        <thead><tr><th>Year</th><th style="text-align:left">Host</th><th style="text-align:left">Champion</th><th style="text-align:left" class="col-hide-mobile">Runner-Up</th><th class="col-hide-mobile">Goals</th><th class="col-hide-mobile">Teams</th><th class="col-hide-mobile">G/M</th></tr></thead>
        <tbody>
          ${WC_HISTORY.map(t => `<tr>
            <td style="font-weight:600;color:var(--gold)">${t.year}</td>
            <td style="font-size:0.78rem;color:var(--text-mid);text-align:left">${t.host}</td>
            <td style="text-align:left;font-size:0.82rem">${t.champion}</td>
            <td class="col-hide-mobile" style="text-align:left;font-size:0.78rem;color:var(--text-mid)">${t.runnerUp}</td>
            <td class="col-hide-mobile">${t.goals}</td>
            <td class="col-hide-mobile" style="color:var(--text-dim)">${t.teams}</td>
            <td class="col-hide-mobile" style="color:var(--text-dim)">${t.gpg}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── Match detail modal ────────────────────────────────────────────────────
window.showMatchDetail = async function(matchId) {
  const m = [...state.matches, ...state.schedule].find(x => x.id === matchId);
  if (!m) return;
  state.selectedMatch = m;

  const awayScore = m.away?.score !== null ? m.away.score : '';
  const homeScore = m.home?.score !== null ? m.home.score : '';
  const hasScore  = m.status !== 'pre' && awayScore !== '' && homeScore !== '';
  const statusLbl = m.status === 'in' ? `🔴 ${m.clock || 'LIVE'}`
                  : m.status === 'post' ? '✓ Full Time'
                  : `🕐 ${matchLocalTime(m.date)}`;

  $('detail-modal-title').textContent = `${m.away?.flag} ${m.away?.name}  vs  ${m.home?.flag} ${m.home?.name}`;
  $('detail-modal-body').innerHTML = `
    <div class="match-detail-header">
      <div class="match-detail-team"><div class="match-detail-flag">${m.away?.flag}</div><div class="match-detail-name">${m.away?.name}</div></div>
      <div class="match-detail-score">
        ${hasScore ? `<div class="match-detail-scoreline">${m.away?.score} – ${m.home?.score}</div>` : `<div class="match-detail-scoreline vs">vs</div>`}
        <div class="match-detail-status">${statusLbl}</div>
        ${[m.round, m.group].filter(Boolean).length ? `<div class="match-detail-round">${[m.round, m.group].filter(Boolean).join(' · ')}</div>` : ''}
      </div>
      <div class="match-detail-team"><div class="match-detail-flag">${m.home?.flag}</div><div class="match-detail-name">${m.home?.name}</div></div>
    </div>
    ${m.venue ? `<div class="match-detail-venue">📍 ${m.venue} · ${matchLocalDate(m.date)}</div>` : ''}

    <div id="match-detail-stats"><div class="bracket-placeholder" style="padding:2rem"><span>Loading match data…</span></div></div>

    <div class="detail-section" style="margin-top:1.25rem">
      <div class="detail-section-title">📺 Where to Watch — Free Options</div>
      <div class="broadcast-grid">
        ${BROADCASTS_GUIDE.map(b => `<div class="broadcast-card">
          <div class="broadcast-region">${b.region}</div>
          <div class="broadcast-channels">${b.channels.join(' · ')}</div>
          <div class="broadcast-free">✓ ${b.free}</div>
          <a href="${b.link}" target="_blank" rel="noopener" class="broadcast-link">Watch now →</a>
        </div>`).join('')}
      </div>
    </div>

    ${getKey() ? `<div class="detail-section" style="margin-top:1rem">
      <div class="detail-section-title">✦ AI Match Analysis</div>
      <div id="match-ai-body" style="font-size:0.83rem;color:var(--text-mid);line-height:1.75;min-height:60px">Click to generate an AI tactical analysis of this match.</div>
      <button class="btn-generate" style="margin-top:0.75rem" onclick="generateMatchAnalysis('${m.id}')">✦ Generate Analysis</button>
    </div>` : ''}`;

  $('detail-modal').classList.add('open');

  // Load full stats in background
  const summary = await fetchMatchSummary(matchId);
  if (summary) updateMatchDetailStats(m, summary);
};

function updateMatchDetailStats(m, summary) {
  const el = $('match-detail-stats');
  if (!el) return;

  const { teamStats, broadcasts, odds, videos, lastFive, h2h, keyEvents = [], gameInfo = {}, article } = summary;
  const away = teamStats.away || {};
  const home = teamStats.home || {};

  const statRows = [
    { label:'Possession',    awayVal: away.stats?.possessionPct, homeVal: home.stats?.possessionPct, unit:'%', isBar:true },
    { label:'Shots',         awayVal: away.stats?.totalShots,    homeVal: home.stats?.totalShots,    unit:'',  isBar:true },
    { label:'Shots on Goal', awayVal: away.stats?.shotsOnGoal,   homeVal: home.stats?.shotsOnGoal,   unit:'',  isBar:true },
    { label:'Corners',       awayVal: away.stats?.wonCorners,     homeVal: home.stats?.wonCorners,    unit:'',  isBar:true },
    { label:'Fouls',         awayVal: away.stats?.foulsCommitted, homeVal: home.stats?.foulsCommitted,unit:'',  isBar:false },
    { label:'Yellow Cards',  awayVal: away.stats?.yellowCards,   homeVal: home.stats?.yellowCards,   unit:'',  isBar:false },
    { label:'Offsides',      awayVal: away.stats?.offsides,      homeVal: home.stats?.offsides,      unit:'',  isBar:false },
    { label:'Saves',         awayVal: away.stats?.saves,         homeVal: home.stats?.saves,         unit:'',  isBar:false },
  ].filter(r => r.awayVal != null && r.homeVal != null);

  const formBadge = (r) => {
    const cls = r === 'W' ? 'form-w' : r === 'L' ? 'form-l' : 'form-d';
    return `<span class="form-badge ${cls}">${r}</span>`;
  };

  const buildForm = (games) => games?.slice(0,5).map(g => formBadge(g.result)).join('') || '–';

  const oddsHTML = odds ? `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">📈 Pre-Match Prediction (Betting Markets)</div>
      <div class="odds-grid">
        <div class="odds-card"><div class="odds-label">${m.away?.flag} ${m.away?.name} Win</div>
          <div class="odds-bar-wrap"><div class="odds-bar" style="width:${odds.awayWin}%"></div></div>
          <div class="odds-pct">${odds.awayWin}%</div><div class="odds-ml">${mlToStr(odds.awayML)}</div></div>
        <div class="odds-card"><div class="odds-label">Draw</div>
          <div class="odds-bar-wrap"><div class="odds-bar draw-bar" style="width:${odds.draw}%"></div></div>
          <div class="odds-pct">${odds.draw}%</div><div class="odds-ml">${mlToStr(odds.drawML)}</div></div>
        <div class="odds-card"><div class="odds-label">${m.home?.flag} ${m.home?.name} Win</div>
          <div class="odds-bar-wrap"><div class="odds-bar home-bar" style="width:${odds.homeWin}%"></div></div>
          <div class="odds-pct">${odds.homeWin}%</div><div class="odds-ml">${mlToStr(odds.homeML)}</div></div>
      </div>
      ${odds.overUnder ? `<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.4rem">Over/Under: <strong>${odds.overUnder}</strong> goals</div>` : ''}
      ${m.status === 'post' ? `<div class="prediction-result">✓ Actual result: ${m.away?.name} ${m.away?.score} – ${m.home?.score} ${m.home?.name}</div>` : ''}
    </div>` : '';

  const statsHTML = statRows.length ? `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">📊 Match Statistics</div>
      <div class="match-stats-table">
        ${statRows.map(r => {
          const aNum = parseFloat(r.awayVal) || 0;
          const hNum = parseFloat(r.homeVal) || 0;
          const tot  = aNum + hNum || 1;
          const aPct = Math.round((aNum/tot)*100);
          const hPct = 100 - aPct;
          return `<div class="stat-row">
            <div class="stat-val-left">${r.awayVal}${r.unit}</div>
            <div class="stat-bars">
              <div class="stat-bar-left"  style="width:${aPct}%"></div>
              <div class="stat-label-center">${r.label}</div>
              <div class="stat-bar-right" style="width:${hPct}%"></div>
            </div>
            <div class="stat-val-right">${r.homeVal}${r.unit}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const formHTML = `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">📋 Recent Form (Last 5)</div>
      <div class="form-grid">
        <div class="form-team">
          <div class="form-team-name">${m.away?.flag} ${m.away?.name}</div>
          <div class="form-badges">${buildForm(lastFive?.away)}</div>
          ${lastFive?.away ? lastFive.away.slice(0,3).map(g => `<div class="form-game"><span class="form-badge ${g.result==='W'?'form-w':g.result==='L'?'form-l':'form-d'}" style="font-size:0.6rem">${g.result}</span> <span style="font-size:0.72rem;color:var(--text-dim)">${g.atVs} ${g.opponent} <strong style="color:var(--text)">${g.score}</strong></span></div>`).join('') : ''}
        </div>
        <div class="form-team">
          <div class="form-team-name">${m.home?.flag} ${m.home?.name}</div>
          <div class="form-badges">${buildForm(lastFive?.home)}</div>
          ${lastFive?.home ? lastFive.home.slice(0,3).map(g => `<div class="form-game"><span class="form-badge ${g.result==='W'?'form-w':g.result==='L'?'form-l':'form-d'}" style="font-size:0.6rem">${g.result}</span> <span style="font-size:0.72rem;color:var(--text-dim)">${g.atVs} ${g.opponent} <strong style="color:var(--text)">${g.score}</strong></span></div>`).join('') : ''}
        </div>
      </div>
    </div>`;

  const h2hHTML = h2h.length ? `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">🔄 Head-to-Head History</div>
      <div style="display:flex;flex-direction:column;gap:0.3rem">
        ${h2h.map(g => `<div style="display:flex;gap:0.75rem;align-items:center;font-size:0.78rem;padding:0.3rem 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-dim);width:60px;flex-shrink:0">${new Date(g.date).toLocaleDateString([],{year:'2-digit',month:'short'})}</span>
          <span style="flex:1;color:var(--text-mid)">${g.competition || 'Friendly'}</span>
          <span style="font-weight:600">${g.score}</span>
        </div>`).join('')}
      </div>
    </div>` : '';

  const videosHTML = videos.length ? `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">🎬 Highlights & Videos</div>
      ${videos.slice(0,3).map(v => `<a href="${v.url}" target="_blank" rel="noopener" class="video-link">
        <span>▶</span> ${v.headline}
      </a>`).join('')}
      <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(`FIFA World Cup 2026 ${m.away?.name} ${m.home?.name} highlights`)}" target="_blank" rel="noopener" class="video-link" style="margin-top:0.4rem">
        <span>▶</span> Search YouTube for highlights
      </a>
    </div>` : `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">🎬 Highlights</div>
      <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(`FIFA World Cup 2026 ${m.away?.name} ${m.home?.name}`)}" target="_blank" rel="noopener" class="video-link">
        <span>▶</span> Search YouTube: ${m.away?.name} vs ${m.home?.name} highlights
      </a>
      <a href="https://www.fifa.com/fifaplus/en" target="_blank" rel="noopener" class="video-link">
        <span>▶</span> FIFA+ — official highlights & clips
      </a>
    </div>`;

  // Broadcasts from API (if available, show alongside guide)
  const broadcastNames = broadcasts.filter(b => b.region === 'us' || !b.region).map(b => b.name);
  const liveChannelsHTML = broadcastNames.length ? `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:0.65rem 0.9rem;margin-bottom:0.5rem;font-size:0.78rem">
      📡 Broadcasting on: <strong style="color:var(--text)">${broadcastNames.join(' · ')}</strong>
    </div>` : '';

  // Key events: goals/cards/subs timeline
  const goals  = keyEvents.filter(e => e.kind === 'goal');
  const yellows = keyEvents.filter(e => e.kind === 'yellow');
  const reds    = keyEvents.filter(e => e.kind === 'red');
  const subs    = keyEvents.filter(e => e.kind === 'sub');

  const kindIcon = { goal:'⚽', yellow:'🟨', red:'🟥', sub:'🔄' };

  const eventsHTML = keyEvents.length ? `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">📋 Match Timeline</div>
      <div style="display:flex;flex-direction:column;gap:0.25rem">
        ${keyEvents.map(e => `
          <div style="display:flex;align-items:flex-start;gap:0.6rem;font-size:0.78rem;padding:0.28rem 0;border-bottom:1px solid var(--border)">
            <span style="width:32px;flex-shrink:0;color:var(--text-dim);font-size:0.7rem;padding-top:2px">${e.minute}'</span>
            <span style="flex-shrink:0">${kindIcon[e.kind] || ''}</span>
            <span style="flex:1;color:var(--text)">${e.athlete ? `<strong>${e.athlete}</strong> — ` : ''}${e.text}</span>
            <span style="font-size:0.65rem;color:var(--text-dim);flex-shrink:0">${e.ha === 'home' ? m.home?.name : e.ha === 'away' ? m.away?.name : ''}</span>
          </div>`).join('')}
      </div>
      ${goals.length ? `<div style="margin-top:0.6rem;font-size:0.73rem;color:var(--text-dim)">⚽ ${goals.length} goal${goals.length>1?'s':''} · 🟨 ${yellows.length} yellow${yellows.length!==1?'s':''} · 🟥 ${reds.length} red${reds.length!==1?'s':''} · 🔄 ${subs.length} sub${subs.length!==1?'s':''}</div>` : ''}
    </div>` : '';

  const attendanceHTML = gameInfo.attendance ? `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.9rem;margin-bottom:0.75rem;font-size:0.78rem">
      🏟 <strong style="color:var(--text)">${Number(gameInfo.attendance).toLocaleString()}</strong> attendance${gameInfo.venue ? ` · ${gameInfo.venue}` : ''}${gameInfo.city ? `, ${gameInfo.city}` : ''}
    </div>` : '';

  const articleHTML = article?.body ? `
    <div class="detail-section" style="margin-bottom:1rem">
      <div class="detail-section-title">📰 Match Report</div>
      ${article.headline ? `<div style="font-size:0.85rem;font-weight:600;color:var(--text);margin-bottom:0.4rem">${article.headline}</div>` : ''}
      <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.7">${article.body.slice(0,800)}${article.body.length>800?'…':''}</div>
    </div>` : '';

  el.innerHTML = attendanceHTML + eventsHTML + oddsHTML + statsHTML + formHTML + h2hHTML + videosHTML + liveChannelsHTML + articleHTML;
}

window.generateMatchAnalysis = async function(matchId) {
  const m = [...state.matches, ...state.schedule].find(x => x.id === matchId);
  if (!m) return;
  const btn = document.querySelector(`#match-ai-body + button`);
  if (btn) { btn.disabled = true; btn.textContent = '✦ Generating…'; }
  state.selectedMatch = m;
  await streamMatchAnalysis(m, $('match-ai-body'));
  if (btn) { btn.disabled = false; btn.textContent = '✦ Generate Analysis'; }
};

// ── City & team detail modals ─────────────────────────────────────────────
window.showCityDetail = function(cityName) {
  const city = HOST_CITIES.find(c => c.city === cityName);
  if (!city) return;
  const cityMatches = state.schedule.filter(m => m.venue && m.venue.toLowerCase().includes(city.stadium.split(' ')[0].toLowerCase()));
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city.stadium + ', ' + city.city)}`;
  const stadiumPhoto = STADIUM_PHOTOS[city.stadium] || '';
  const cityPhoto    = CITY_PHOTOS[city.city] || '';
  $('detail-modal-title').textContent = `${city.flag} ${city.city}`;
  $('detail-modal-body').innerHTML = `
    ${stadiumPhoto ? `<div class="modal-hero-photo"><img src="${stadiumPhoto}" alt="${city.stadium}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.parentElement.style.display='none'"><div class="modal-hero-overlay"><div class="modal-hero-caption">${city.stadium}</div></div></div>` : ''}
    <div class="detail-section">
      ${!stadiumPhoto ? `<div class="detail-hero-stat">${city.stadium}</div>` : ''}
      ${city.highlight ? `<div class="detail-badge">★ ${city.highlight}</div>` : ''}
      <p style="font-size:0.85rem;color:var(--text-dim);line-height:1.65;margin-top:0.75rem">${city.description}</p>
    </div>
    <div class="detail-stats-row">
      <div class="detail-stat"><div class="detail-stat-val">${city.capacity.toLocaleString()}</div><div class="detail-stat-lbl">Capacity</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${city.matches}</div><div class="detail-stat-lbl">Matches</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${city.country}</div><div class="detail-stat-lbl">Country</div></div>
    </div>
    <div class="detail-section"><div class="detail-section-title">🚇 Getting There</div><p style="font-size:0.82rem;color:var(--text-dim)">${city.transport}</p></div>
    <div class="detail-section"><div class="detail-section-title">🎯 Top Attractions</div>
      <div class="tourist-grid">${city.tourist.map(t => `<div class="tourist-card"><div class="tourist-emoji">${t.emoji}</div><div><div class="tourist-name">${t.name}</div><div class="tourist-note">${t.note}</div></div></div>`).join('')}</div>
    </div>
    ${cityMatches.length ? `<div class="detail-section"><div class="detail-section-title">⚽ Matches at this Venue</div><div class="scores-grid">${cityMatches.map(m => matchCardHTML(m, true)).join('')}</div></div>` : ''}
    <div class="detail-section"><a href="${mapsUrl}" target="_blank" rel="noopener" class="detail-maps-btn">📍 Open in Google Maps</a></div>`;
  $('detail-modal').classList.add('open');
};

window.showTeamDetail = async function(teamName) {
  let teamFlag = '⚽';
  let teamGroup = null;
  let teamEntry = null;
  let teamAbbr  = '';
  let teamId    = '';

  for (const g of state.standings) {
    const e = g.entries.find(e => e.name === teamName);
    if (e) { teamGroup = g.name; teamEntry = e; teamFlag = e.flag; teamAbbr = e.abbr; teamId = e.id; break; }
  }
  if (!teamFlag || teamFlag === '⚽') {
    const m = [...state.schedule, ...state.matches].find(m => m.home?.name === teamName || m.away?.name === teamName);
    if (m) {
      const side = m.home?.name === teamName ? m.home : m.away;
      teamFlag = side.flag; teamAbbr = side.abbr; teamId = side.id;
    }
  }
  if (!teamId && teamAbbr && state.teamIdMap[teamAbbr.toUpperCase()]) {
    teamId = state.teamIdMap[teamAbbr.toUpperCase()];
  }

  const teamMatches = state.schedule.filter(m => m.home?.name === teamName || m.away?.name === teamName);
  let w=0, d=0, l=0, gf=0, ga=0;
  for (const m of teamMatches) {
    if (m.status !== 'post') continue;
    const isHome = m.home?.name === teamName;
    const my = parseInt(isHome ? m.home.score : m.away.score)||0;
    const op = parseInt(isHome ? m.away.score : m.home.score)||0;
    gf += my; ga += op;
    if (my > op) w++; else if (my === op) d++; else l++;
  }

  $('detail-modal-title').textContent = `${teamFlag} ${teamName}`;
  $('detail-modal-body').innerHTML = `
    <div class="detail-section" style="text-align:center">
      <div style="font-size:4rem;margin-bottom:0.5rem">${teamFlag}</div>
      ${teamGroup ? `<div class="detail-badge" style="margin:0 auto 0.75rem;display:table">${teamGroup}${teamEntry ? ` · Position ${teamEntry.pos}` : ''}</div>` : ''}
    </div>
    ${teamEntry ? `<div class="detail-stats-row">
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.pts}</div><div class="detail-stat-lbl">Points</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.w}/${teamEntry.d}/${teamEntry.l}</div><div class="detail-stat-lbl">W / D / L</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.gf}–${teamEntry.ga}</div><div class="detail-stat-lbl">Goals</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.gd > 0 ? '+' : ''}${teamEntry.gd}</div><div class="detail-stat-lbl">Goal Diff</div></div>
    </div>` : (w+d+l > 0 ? `<div class="detail-stats-row">
      <div class="detail-stat"><div class="detail-stat-val">${w*3+d}</div><div class="detail-stat-lbl">Points</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${w}/${d}/${l}</div><div class="detail-stat-lbl">W / D / L</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${gf}–${ga}</div><div class="detail-stat-lbl">Goals</div></div>
    </div>` : '')}
    ${teamMatches.length ? `<div class="detail-section"><div class="detail-section-title">📅 Tournament Matches</div><div class="scores-grid">${teamMatches.map(m => matchCardHTML(m, true)).join('')}</div></div>` : ''}
    <div class="detail-section" id="roster-section">
      <div class="detail-section-title">👥 Squad</div>
      <div id="roster-container"><div class="bracket-placeholder" style="padding:1.5rem"><span>Loading squad…</span></div></div>
    </div>`;

  $('detail-modal').classList.add('open');

  // Load roster
  if (teamId) {
    const roster = await fetchTeamRoster(teamId);
    renderRoster(roster);
  } else {
    $('roster-container').innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim)">Squad data not available yet — finalised closer to the tournament.</div>';
  }
};

// Store roster globally so player modal can look up by name
let _currentRoster = [];

function renderRoster(roster) {
  _currentRoster = roster;
  const el = $('roster-container');
  if (!el) return;
  if (!roster.length) { el.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim)">No squad data available yet.</div>'; return; }
  const posOrder = { GK:0, Goalkeeper:0, Defender:1, Midfielder:2, Forward:3, Attacker:3 };
  const byPos = {};
  for (const p of roster) {
    const pos = p.position || 'Other';
    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push(p);
  }
  const sorted = Object.entries(byPos).sort(([a],[b]) => (posOrder[a]??9) - (posOrder[b]??9));
  el.innerHTML = sorted.map(([pos, players]) => `
    <div style="margin-bottom:1.25rem">
      <div style="font-size:0.68rem;font-weight:600;letter-spacing:0.07em;color:var(--text-dim);text-transform:uppercase;margin-bottom:0.5rem">${pos}s</div>
      <div class="roster-grid">
        ${players.sort((a,b) => (parseInt(a.number)||99) - (parseInt(b.number)||99)).map(p => {
          const idx = _currentRoster.indexOf(p);
          return `<div class="roster-card" onclick="showPlayerDetail(${idx})" style="cursor:pointer">
            ${p.photo
              ? `<img class="roster-photo" src="${p.photo}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                 <div class="roster-number" style="display:none">${p.number || '–'}</div>`
              : `<div class="roster-number">${p.number || '–'}</div>`}
            <div class="roster-info">
              <div class="roster-name">${p.name}</div>
              <div class="roster-meta">${p.number ? `#${p.number} · ` : ''}${p.position || ''}${p.club ? ` · ${p.club}` : ''}${p.age ? ` · ${p.age}y` : ''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

window.showPlayerDetail = function(idx) {
  const p = _currentRoster[idx];
  if (!p) return;
  $('detail-modal-title').textContent = p.name;
  $('detail-modal-body').innerHTML = `
    <div style="display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:1.5rem">
      <div style="flex-shrink:0">
        ${p.photo
          ? `<img src="${p.photo}" alt="${p.name}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;background:var(--bg2);display:block" onerror="this.style.display='none'">`
          : `<div style="width:120px;height:120px;border-radius:50%;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:var(--text-dim)">#${p.number||'?'}</div>`}
      </div>
      <div style="flex:1;min-width:200px">
        <div style="font-size:1.5rem;font-weight:700;margin-bottom:0.25rem">${p.name}</div>
        <div style="font-size:0.9rem;color:var(--gold);font-weight:600;margin-bottom:1rem">${p.position || ''}${p.number ? ` · #${p.number}` : ''}</div>
        <div class="player-detail-grid">
          ${p.club       ? `<div class="pd-row"><span class="pd-lbl">Club</span><span class="pd-val">${p.club}</span></div>` : ''}
          ${p.nationality? `<div class="pd-row"><span class="pd-lbl">Nationality</span><span class="pd-val">${p.nationality}</span></div>` : ''}
          ${p.age        ? `<div class="pd-row"><span class="pd-lbl">Age</span><span class="pd-val">${p.age}</span></div>` : ''}
          ${p.birthDate  ? `<div class="pd-row"><span class="pd-lbl">Born</span><span class="pd-val">${new Date(p.birthDate).toLocaleDateString([], {year:'numeric',month:'long',day:'numeric'})}</span></div>` : ''}
          ${p.birthPlace ? `<div class="pd-row"><span class="pd-lbl">Birthplace</span><span class="pd-val">${p.birthPlace}</span></div>` : ''}
          ${p.height     ? `<div class="pd-row"><span class="pd-lbl">Height</span><span class="pd-val">${p.height}</span></div>` : ''}
          ${p.weight     ? `<div class="pd-row"><span class="pd-lbl">Weight</span><span class="pd-val">${p.weight}</span></div>` : ''}
        </div>
      </div>
    </div>`;
  $('detail-modal').classList.add('open');
};

window.closeDetailModal = function() { $('detail-modal').classList.remove('open'); };
document.addEventListener('click', e => {
  if (e.target.id === 'detail-modal') window.closeDetailModal();
  if (e.target.id === 'config-modal') window.closeConfig();
});

// ── Leaflet map ───────────────────────────────────────────────────────────
let leafletMap = null;

function initMap() {
  if (leafletMap) return;
  const mapEl = $('stadium-map');
  if (!mapEl || !window.L) return;
  leafletMap = L.map('stadium-map', { zoomControl:true, scrollWheelZoom:false }).setView([37,-97], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:'© OpenStreetMap © CartoDB', subdomains:'abcd', maxZoom:19,
  }).addTo(leafletMap);
  HOST_CITIES.forEach(city => {
    const marker = L.marker(city.coords, { icon: L.divIcon({ className:'', html:`<div class="map-marker">${city.flag}</div>`, iconSize:[32,32], iconAnchor:[16,16] }) }).addTo(leafletMap);
    marker.bindPopup(`<div class="map-popup">
      <div class="map-popup-city">${city.flag} ${city.city}</div>
      <div class="map-popup-stadium">${city.stadium}</div>
      <div class="map-popup-meta">🏟 ${city.capacity.toLocaleString()} · ⚽ ${city.matches} matches</div>
      <button class="map-popup-btn" onclick="showCityDetail('${city.city}')">View Details →</button>
    </div>`, { className:'dark-popup', maxWidth:220 });
  });
  setTimeout(() => leafletMap.invalidateSize(), 200);
}

// ── Bracket ───────────────────────────────────────────────────────────────
// ── Knockout Bracket ─────────────────────────────────────────────────────────
// ESPN event ID mapping for the 2026 WC knockout rounds
const BRACKET_IDS = {
  r32:  ['760486','760487','760488','760489','760490','760491','760492','760493',
          '760494','760495','760496','760497','760498','760499','760500','760501'],
  r16:  ['760502','760503','760504','760505','760507','760506','760508','760509'],
  qf:   ['760510','760511','760512','760513'],
  sf:   ['760514','760515'],
  third:'760516',
  final:'760517',
};

// Bracket tree — each node = { matchIdx, top, bottom }
// matchIdx references position in the respective round array
// Feeds left side → SF1, right side → SF2
const BRACKET_TREE = {
  // left half (feeds SF1 = sf[0])
  sf0: {
    qf0: {
      r16_0: { top: 0, bot: 2 },   // M1(760486) vs M3(760488) → R16[0]
      r16_1: { top: 1, bot: 4 },   // M2(760487) vs M5(760490) → R16[1]
    },
    qf1: {
      r16_4: { top: 8, bot: 9 },   // M9(760494) vs M10(760495) → R16[4]
      r16_5: { top: 10, bot: 11 }, // M11(760496) vs M12(760497) → R16[5]
    },
  },
  // right half (feeds SF2 = sf[1])
  sf1: {
    qf2: {
      r16_2: { top: 3, bot: 5 },   // M4(760489) vs M6(760491) → R16[2]
      r16_3: { top: 6, bot: 7 },   // M7(760492) vs M8(760493) → R16[3]
    },
    qf3: {
      r16_6: { top: 12, bot: 14 }, // M13(760498) vs M15(760500) → R16[6]
      r16_7: { top: 13, bot: 15 }, // M14(760499) vs M16(760501) → R16[7]
    },
  },
};

function renderBracket() {
  const el = $('bracket-container');
  if (!el) return;

  // Look up a match from state.schedule by ESPN event ID
  const byId = {};
  for (const m of state.schedule) byId[m.id] = m;

  const getMatch = id => byId[id] || null;

  // Build group standings index: { 'A': [{pos,name,flag,gp,pts,gd,gf,...}, ...] }
  const byGroup = {};
  for (const g of state.standings) {
    const letter = g.name.replace('Group ', '').trim();
    byGroup[letter] = g.entries; // pre-sorted by pos
  }

  // Reverse map: team name → group letter (used by predictedByGroup)
  const teamToGroup = {};
  for (const [letter, entries] of Object.entries(byGroup)) {
    for (const e of entries) teamToGroup[e.name] = letter;
  }

  // Predicted final standings: start from actual standings, apply pre-match
  // predictions for every unplayed group stage match.
  const predictedByGroup = (() => {
    const pred = {};
    for (const [l, entries] of Object.entries(byGroup)) {
      pred[l] = entries.map(e => ({ ...e }));
    }
    for (const m of state.schedule) {
      if (m.status !== 'pre') continue;
      const hName = m.home?.name, aName = m.away?.name;
      if (!hName || !aName) continue;
      const letter = teamToGroup[hName];
      if (!letter || teamToGroup[aName] !== letter) continue;
      const grp = pred[letter];
      const hE = grp.find(e => e.name === hName);
      const aE = grp.find(e => e.name === aName);
      if (!hE || !aE) continue;

      const odds = state.matchOdds[m.id];
      let outcome;
      if (odds) {
        outcome = odds.draw >= odds.home && odds.draw >= odds.away ? 'draw'
                : odds.home >= odds.away ? 'home' : 'away';
      } else {
        // Fallback: pts×3 + gd as strength proxy; predict win/draw
        const hStr = hE.pts * 3 + (hE.gd || 0);
        const aStr = aE.pts * 3 + (aE.gd || 0);
        outcome = hStr > aStr ? 'home' : aStr > hStr ? 'away' : 'draw';
      }

      hE.gp = (hE.gp || 0) + 1;
      aE.gp = (aE.gp || 0) + 1;
      if (outcome === 'home') {
        hE.pts += 3; hE.gf = (hE.gf||0)+1; hE.gd = (hE.gd||0)+1;
        aE.ga = (aE.ga||0)+1; aE.gd = (aE.gd||0)-1;
      } else if (outcome === 'away') {
        aE.pts += 3; aE.gf = (aE.gf||0)+1; aE.gd = (aE.gd||0)+1;
        hE.ga = (hE.ga||0)+1; hE.gd = (hE.gd||0)-1;
      } else {
        hE.pts += 1; aE.pts += 1;
      }
    }
    for (const l of Object.keys(pred)) {
      pred[l].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    }
    return pred;
  })();

  // 0-based index of team in predicted final standings (-1 if not found)
  function predictedRank(name, letter) {
    return (predictedByGroup[letter] || []).findIndex(e => e.name === name);
  }

  // Per-group exact enumeration of all remaining-match outcome combinations.
  // Returns { teamName: [p1st, p2nd, p3rd, p4th] } where values are probabilities (0–1).
  function computeGroupProbabilities(letter) {
    const entries = byGroup[letter] || [];
    if (!entries.length) return {};
    const unplayed = state.schedule.filter(m =>
      m.status === 'pre' &&
      m.round === 'Group Stage' &&
      m.home?.name && m.away?.name &&
      teamToGroup[m.home.name] === letter &&
      teamToGroup[m.away.name] === letter
    );
    const probs = Object.fromEntries(entries.map(e => [e.name, [0, 0, 0, 0]]));
    function enumerate(idx, snap, weight) {
      if (idx === unplayed.length) {
        const sorted = [...snap].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
        sorted.forEach((e, i) => { if (probs[e.name]) probs[e.name][i] += weight; });
        return;
      }
      const match = unplayed[idx];
      const odds = state.matchOdds[match.id];
      const pH = (odds?.home ?? 33) / 100;
      const pD = (odds?.draw ?? 33) / 100;
      const pA = (odds?.away ?? 34) / 100;
      for (const [result, p] of [['home', pH], ['draw', pD], ['away', pA]]) {
        if (p <= 0) continue;
        const next = snap.map(e => ({ ...e }));
        const hE = next.find(e => e.name === match.home.name);
        const aE = next.find(e => e.name === match.away.name);
        if (hE && aE) {
          hE.gp++; aE.gp++;
          if (result === 'home')       { hE.pts += 3; hE.gf++; hE.gd++; aE.ga++; aE.gd--; }
          else if (result === 'away')  { aE.pts += 3; aE.gf++; aE.gd++; hE.ga++; hE.gd--; }
          else                         { hE.pts++; aE.pts++; }
        }
        enumerate(idx + 1, next, weight * p);
      }
    }
    enumerate(0, entries.map(e => ({ gf: 0, ga: 0, gd: 0, ...e })), 1);
    return probs;
  }

  const groupProbs = Object.fromEntries(
    Object.keys(byGroup).map(l => [l, computeGroupProbabilities(l)])
  );

  // Detect placeholder displayNames like "Group A Winner", "Third Place Group A/B/C"
  const PLACEHOLDER_RE = /^(Group [A-L] (Winner|2nd Place)|Third Place Group [A-L/]+)$/i;
  const isPlaceholder = dn => PLACEHOLDER_RE.test(dn);

  // Collect teams already committed to a specific R32 slot (e.g. Mexico in 760491).
  // These must never appear as candidates in any other slot.
  const committedTeams = new Set();
  for (const id of BRACKET_IDS.r32) {
    const m = getMatch(id);
    if (!m) continue;
    if (m.home?.displayName && !isPlaceholder(m.home.displayName)) committedTeams.add(m.home.name);
    if (m.away?.displayName && !isPlaceholder(m.away.displayName)) committedTeams.add(m.away.name);
  }

  // Return candidates for an ESPN placeholder team displayName.
  // confirmed=true means group finished and position is locked.
  // leader=true means currently holds that position (group not done).
  function candidates(displayName) {
    if (!displayName || !isPlaceholder(displayName)) return null;
    let m;

    if (m = displayName.match(/^Group ([A-L]) Winner$/i)) {
      return posCandidates(byGroup[m[1]] || [], 1, m[1]);
    }
    if (m = displayName.match(/^Group ([A-L]) 2nd Place$/i)) {
      return posCandidates(byGroup[m[1]] || [], 2, m[1]);
    }
    if (m = displayName.match(/Third Place Group ([A-L/]+)/i)) {
      return thirdCandidates(m[1].split('/'));
    }
    return null;
  }

  // Teams that can still finish at targetPos (1-based) in the group,
  // excluding teams already committed to specific R32 slots.
  // Results are ordered by predicted likelihood of occupying targetPos,
  // using the predictedByGroup table built from pre-match odds.
  function posCandidates(entries, targetPos, groupLetter) {
    if (!entries.length) return [];

    const eligible = entries.filter(e => !committedTeams.has(e.name));
    if (!eligible.length) return [];

    const groupDone = entries.every(e => e.gp === 3);

    if (groupDone) {
      const rawHolder = entries[targetPos - 1];
      if (!rawHolder) return [];
      if (!committedTeams.has(rawHolder.name)) {
        return [{ ...rawHolder, confirmed: true, leader: false }];
      }
      const next = entries.slice(targetPos).find(e => !committedTeams.has(e.name));
      return next ? [{ ...next, confirmed: true, leader: false }] : [];
    }

    const rawAtPos = entries[targetPos - 1];
    const threshold = rawAtPos?.pts ?? 0;
    const rawIsEligible = rawAtPos && !committedTeams.has(rawAtPos.name);

    const result = eligible
      .filter(e => (e.pts + (3 - e.gp) * 3) >= threshold)
      .map(e => ({ ...e, confirmed: false, leader: false, prob: groupProbs[groupLetter]?.[e.name]?.[targetPos - 1] ?? null }))
      .filter(e => e.prob === null || e.prob > 0);

    // Sort by predicted proximity to targetPos: team predicted closest to this
    // position (by 0-based index) is most likely to occupy the slot.
    result.sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));

    // Leader = first team in predicted order (fallback: raw position holder)
    if (result.length) {
      result[0].leader = true;
    } else if (rawIsEligible) {
      // No predicted data yet — fall back to raw position holder
      const fb = eligible.find(e => e.name === rawAtPos.name);
      if (fb) fb.leader = true;
    }

    return result;
  }

  // Teams that may qualify as a 3rd-place finisher from the given group letters.
  // Checks all 4 positions: 1st/2nd can fall to 3rd; 4th can rise to 3rd.
  // For 1st/2nd: need (2-i) teams below that can STRICTLY exceed their pts (not just tie).
  function thirdCandidates(letters) {
    const thirds = [];
    for (const l of letters) {
      const grp = byGroup[l] || [];
      if (grp.length < 3) continue;
      const groupDone = grp.every(e => e.gp === 3);
      const current3rd = grp[2];

      if (groupDone) {
        // Only the actual 3rd-place team matters once the group is over.
        if (current3rd && !committedTeams.has(current3rd.name)) {
          thirds.push({ ...current3rd, groupLetter: l, confirmed: true, possible: false, prob: null });
        }
      } else {
        for (let i = 0; i < grp.length; i++) { // all positions
          const team = grp[i];
          if (!team || committedTeams.has(team.name)) continue;
          const teamMax = team.pts + (3 - team.gp) * 3;

          if (i <= 1) {
            // Currently 1st or 2nd: can fall to 3rd only if enough teams below can overtake.
            // Need (2-i) teams from below to surpass this team's current pts.
            // Use strictly > (not >=): a team that can only match this team's pts would
            // need H2H tiebreakers to rank above, but if they already lost to this team
            // head-to-head they can't. Strict > is a safe conservative heuristic.
            const needed = 2 - i;
            const canOvertake = grp.slice(i + 1).filter(e =>
              !committedTeams.has(e.name) && (e.pts + (3 - e.gp) * 3) > team.pts
            );
            if (canOvertake.length < needed) continue;
          } else if (i === 3) {
            // Currently 4th: only include if they can reach 3rd's current points.
            if (!current3rd || teamMax < current3rd.pts) continue;
          }
          // i === 2 (currently 3rd): always a candidate.

          const couldReach2nd = current3rd && i < 2
            ? false // already above 3rd, this flag is for upward movement
            : !!(grp[1] && teamMax >= grp[1].pts);
          const p3 = groupProbs[l]?.[team.name]?.[2] ?? null;
          if (p3 !== null && p3 === 0) continue;
          thirds.push({ ...team, groupLetter: l, confirmed: false, possible: couldReach2nd, prob: p3 });
        }
      }
    }
    // Sort by predicted proximity to 3rd place (index 2) within each team's group.
    // Tie-break across groups: more predicted pts = stronger 3rd-place candidate.
    thirds.sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
    const allConfirmed = thirds.length > 0 && thirds.every(t => t.confirmed);
    return thirds.map((t, i) => ({
      ...t,
      leader: !allConfirmed && i === 0,
    }));
  }

  // Render one team row inside a slot
  function teamRow(team, winnerClass) {
    const cands = team?.displayName ? candidates(team.displayName) : null;
    if (!cands) {
      // Real (determined) team
      const logo = team?.logo
        ? `<img class="bk-logo" src="${team.logo}" alt="${team.name||''}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="bk-flag" style="display:none">${team?.flag||'⚽'}</span>`
        : `<span class="bk-flag">${team?.flag||'⚽'}</span>`;
      return `<div class="bk-team${winnerClass ? ' '+winnerClass : ''}">
        ${logo}<span class="bk-name">${team?.name||'TBD'}</span>
      </div>`;
    }
    // Placeholder: show candidates
    if (!cands.length) {
      return `<div class="bk-team bk-cands"><span class="bk-cand-lbl">${team.displayName||team.name}</span></div>`;
    }
    const rows = cands.map(c => {
      const cls = c.confirmed ? 'bk-cand-sure' : (c.leader ? 'bk-cand-lead' : 'bk-cand-maybe');
      const badge = c.confirmed ? '<span class="bk-tick">✓</span>' : (c.leader ? '<span class="bk-tick bk-tick-lead">▶</span>' : '');
      const probPct = (!c.confirmed && c.prob != null) ? Math.round(c.prob * 100) : null;
      const probStr = probPct != null ? `<span class="bk-prob">${probPct}%</span>` : '';
      return `<div class="bk-cand ${cls}">
        <span class="bk-flag" style="font-size:0.8rem">${c.flag||'⚽'}</span>
        <span class="bk-cand-name">${c.name}</span>${probStr}${badge}
      </div>`;
    }).join('');
    return `<div class="bk-team bk-cands">
      <div class="bk-cand-lbl">${team.displayName||team.name}</div>
      ${rows}
    </div>`;
  }

  // Render one match slot
  function slot(m, label, isFinal = false) {
    if (!m) {
      return `<div class="bk-slot bk-tbd${isFinal?' bk-final-slot':''}">
        <div class="bk-team"><span class="bk-flag">⚽</span><span class="bk-name">${label||'TBD'}</span></div>
        <div class="bk-divider"></div>
        <div class="bk-team"><span class="bk-flag">⚽</span><span class="bk-name">TBD</span></div>
      </div>`;
    }
    const isPre  = m.status === 'pre';
    const isLive = m.status === 'in';
    const isFT   = m.status === 'post';
    const dateStr = new Date(m.date).toLocaleDateString([], { month:'short', day:'numeric' });
    const timeStr = new Date(m.date).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    const badge = isLive ? `<span class="bk-live">LIVE ${m.clock||''}</span>` : (isFT ? `<span class="bk-ft">FT</span>` : `<span class="bk-date">${dateStr} ${timeStr}</span>`);
    const awayWon = isFT && m.away?.score > m.home?.score;
    const homeWon = isFT && m.home?.score > m.away?.score;
    // For confirmed matches, add score to team row
    const awayScore = (isFT||isLive) ? `<span class="bk-score">${m.away?.score??''}</span>` : '';
    const homeScore = (isFT||isLive) ? `<span class="bk-score">${m.home?.score??''}</span>` : '';
    const awayRow = !candidates(m.away?.displayName||'')
      ? `<div class="bk-team${awayWon?' bk-winner':''}">
          ${m.away?.logo ? `<img class="bk-logo" src="${m.away.logo}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="bk-flag" style="display:none">${m.away?.flag||'⚽'}</span>` : `<span class="bk-flag">${m.away?.flag||'⚽'}</span>`}
          <span class="bk-name">${m.away?.name||'TBD'}</span>${awayScore}
        </div>`
      : teamRow(m.away, awayWon ? 'bk-winner' : '');
    const homeRow = !candidates(m.home?.displayName||'')
      ? `<div class="bk-team${homeWon?' bk-winner':''}">
          ${m.home?.logo ? `<img class="bk-logo" src="${m.home.logo}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="bk-flag" style="display:none">${m.home?.flag||'⚽'}</span>` : `<span class="bk-flag">${m.home?.flag||'⚽'}</span>`}
          <span class="bk-name">${m.home?.name||'TBD'}</span>${homeScore}
        </div>`
      : teamRow(m.home, homeWon ? 'bk-winner' : '');
    return `<div class="bk-slot${isFinal?' bk-final-slot':''}${isLive?' bk-slot-live':''}" onclick="showMatchDetail('${m.id}')" style="cursor:pointer">
      ${awayRow}
      <div class="bk-divider">${badge}</div>
      ${homeRow}
    </div>`;
  }

  // Pair two slots with connector lines
  function pair(topSlot, botSlot) {
    return `<div class="bk-pair">${topSlot}${botSlot}</div>`;
  }

  // Wrap a pair + its resulting match into a bracket node
  function node(pairHtml, matchSlot) {
    return `<div class="bk-node">${pairHtml}<div class="bk-arm"></div>${matchSlot}</div>`;
  }

  // Build left half (top-down: QF0, QF1 → SF1)
  const r32 = BRACKET_IDS.r32.map(id => getMatch(id));
  const r16  = BRACKET_IDS.r16.map(id => getMatch(id));
  const qf   = BRACKET_IDS.qf.map(id => getMatch(id));
  const sf   = BRACKET_IDS.sf.map(id => getMatch(id));
  const fin  = getMatch(BRACKET_IDS.final);
  const trd  = getMatch(BRACKET_IDS.third);

  // Left side
  const L_r16_0 = node(pair(slot(r32[0],'1A/2A'), slot(r32[2],'1C/2C')), slot(r16[0],'R16'));
  const L_r16_1 = node(pair(slot(r32[1],'1B/2B'), slot(r32[4],'1E/2E')), slot(r16[1],'R16'));
  const L_qf0   = node(pair(L_r16_0, L_r16_1), slot(qf[0],'QF'));

  const L_r16_4 = node(pair(slot(r32[8],'1D/3rd'), slot(r32[9],'1L/3rd')), slot(r16[4],'R16'));
  const L_r16_5 = node(pair(slot(r32[10],'2K/2L'), slot(r32[11],'1H/2J')), slot(r16[5],'R16'));
  const L_qf1   = node(pair(L_r16_4, L_r16_5), slot(qf[1],'QF'));

  const L_sf = node(pair(L_qf0, L_qf1), slot(sf[0],'SF'));

  // Right side (mirrored)
  const R_r16_2 = node(pair(slot(r32[3],'3rd/1E'), slot(r32[5],'MEX/3rd')), slot(r16[2],'R16'));
  const R_r16_3 = node(pair(slot(r32[6],'3rd/1I'), slot(r32[7],'1G/3rd')), slot(r16[3],'R16'));
  const R_qf2   = node(pair(R_r16_2, R_r16_3), slot(qf[2],'QF'));

  const R_r16_6 = node(pair(slot(r32[12],'1B/3rd'), slot(r32[14],'1J/2H')), slot(r16[6],'R16'));
  const R_r16_7 = node(pair(slot(r32[13],'2D/2G'), slot(r32[15],'1K/3rd')), slot(r16[7],'R16'));
  const R_qf3   = node(pair(R_r16_6, R_r16_7), slot(qf[3],'QF'));

  const R_sf = node(pair(R_qf2, R_qf3), slot(sf[1],'SF'));

  // Final
  const finalNode = node(pair(L_sf, R_sf), slot(fin,'Final',true));

  el.innerHTML = `
    <div class="bk-legend">
      <span class="bk-legend-item"><span class="bk-live">LIVE</span> Live match</span>
      <span class="bk-legend-item"><span class="bk-ft">FT</span> Completed</span>
      <span class="bk-legend-item bk-winner-eg">🏅 Winner highlighted</span>
    </div>
    <div class="bk-scroll">
      <div class="bk-root">${finalNode}</div>
    </div>
    <div class="bk-third">
      <div class="scores-section-label" style="margin-bottom:0.5rem">🥉 Third Place Playoff · Hard Rock Stadium · Jul 18</div>
      ${slot(trd,'3rd Place')}
    </div>`;
}

// ── News ──────────────────────────────────────────────────────────────────
function renderNews() {
  const el = $('news-container');
  if (!state.news.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">📰</span><span>Loading news…</span></div>`;
    return;
  }
  el.innerHTML = state.news.slice(0,12).map(a => {
    const tag = a.categories[0] || 'World Cup 2026';
    return `<div class="card news-card" id="news-${a.id}">
      <div class="news-meta"><span class="news-tag">${tag}</span><span class="news-time">${relativeTime(a.published)}</span></div>
      <div class="news-title">${a.headline}</div>
      <div class="news-summary" id="summary-${a.id}">${state.newsExpanded.has(a.id) ? (a.aiSummary || a.description || '') : (a.description ? a.description.slice(0,140)+(a.description.length>140?'…':'') : '')}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap">
        ${getKey() ? `<button class="section-link" onclick="summarise('${a.id}')">✦ AI Summary</button>` : '<span class="ai-badge">Set API key for AI</span>'}
        ${a.links ? `<a href="${a.links}" target="_blank" rel="noopener" class="section-link">Read more →</a>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Render: Gallery ───────────────────────────────────────────────────────
function galleryCard(g, clickAttr) {
  return `<div class="gallery-card" ${clickAttr}>
    <div class="gallery-img">
      <img src="${g.img}" alt="${g.title}" loading="lazy"
           onerror="this.style.opacity='0';this.nextElementSibling.style.background='var(--bg3)'">
      <div class="gallery-overlay">
        <div class="gallery-title">${g.title}</div>
        <div class="gallery-sub">${g.sub}</div>
      </div>
    </div>
  </div>`;
}

function renderGallery() {
  const el = $('gallery-container');
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = '1';

  // Real WC 2026 match & tournament photos via weserv.nl CDN
  const MATCH_PHOTOS = [
    { title:'USA vs Paraguay', sub:'Group A · Match 4 · MetLife Stadium, New York · Jun 14, 2026', img: wp('/wikipedia/commons/thumb/6/6d/2026_FIFA_World_Cup_Match_4%2C_United_States_v_Paraguay_%282%29.jpg/960px-2026_FIFA_World_Cup_Match_4%2C_United_States_v_Paraguay_%282%29.jpg', 700) },
    { title:'USA vs Paraguay — Action', sub:'Group A · Match 4 · MetLife Stadium · Jun 14, 2026', img: wp('/wikipedia/commons/thumb/0/05/2026_FIFA_World_Cup_Match_4%2C_United_States_v_Paraguay_%281%29.jpg/960px-2026_FIFA_World_Cup_Match_4%2C_United_States_v_Paraguay_%281%29.jpg', 700) },
    { title:'MetLife Stadium — Match Day', sub:'Group A · 3 hours before kick-off · New York / New Jersey', img: wp('/wikipedia/commons/thumb/5/5b/2026_FIFA_World_Cup_Match_4%2C_United_States_v_Paraguay_%28stadium_3_hours_before%29.jpg/960px-2026_FIFA_World_Cup_Match_4%2C_United_States_v_Paraguay_%28stadium_3_hours_before%29.jpg', 700) },
    { title:'Morocco vs Niger — Attack', sub:'WC 2026 Qualifier · Match action at full pace', img: wp('/wikipedia/commons/thumb/f/fe/World_Cup_2026_Qualifiers_%28Morocco_v_Niger%29_5.jpg/960px-World_Cup_2026_Qualifiers_%28Morocco_v_Niger%29_5.jpg', 700) },
    { title:'Morocco vs Niger — Midfield', sub:'WC 2026 Qualifier · Intense qualifying battle', img: wp('/wikipedia/commons/thumb/8/8d/World_Cup_2026_Qualifiers_%28Morocco_v_Niger%29_1.jpg/960px-World_Cup_2026_Qualifiers_%28Morocco_v_Niger%29_1.jpg', 700) },
    { title:'Morocco vs Niger — Duel', sub:'WC 2026 Qualifier · Physical contest for the ball', img: wp('/wikipedia/commons/thumb/2/2e/World_Cup_2026_Qualifiers_%28Morocco_v_Niger%29_25.jpg/960px-World_Cup_2026_Qualifiers_%28Morocco_v_Niger%29_25.jpg', 700) },
  ];

  const GALLERY = [
    { title:'MetLife Stadium', sub:'New York / New Jersey · 82,500 · World Cup Final venue', img: STADIUM_PHOTOS['MetLife Stadium'], click: "showSection('scores')" },
    { title:'Estadio Azteca', sub:'Mexico City · 87,523 · Only stadium to host 3 WC finals', img: STADIUM_PHOTOS['Estadio Azteca'], click: "showSection('cities')" },
    { title:'SoFi Stadium', sub:'Los Angeles · 70,240 · Opening Ceremony venue', img: STADIUM_PHOTOS['SoFi Stadium'], click: "showSection('cities')" },
    { title:'AT&T Stadium', sub:'Dallas · 80,000 · Largest seating capacity in tournament', img: STADIUM_PHOTOS['AT&T Stadium'], click: "showSection('cities')" },
    { title:'Mercedes-Benz Stadium', sub:'Atlanta · 71,000 · Retractable petal roof', img: STADIUM_PHOTOS['Mercedes-Benz Stadium'], click: "showSection('cities')" },
    { title:'Arrowhead Stadium', sub:'Kansas City · 76,416 · Loudest crowd in the NFL', img: STADIUM_PHOTOS['Arrowhead Stadium'], click: "showSection('cities')" },
    { title:'Lumen Field', sub:'Seattle · 69,000 · One of the loudest stadiums on Earth', img: STADIUM_PHOTOS['Lumen Field'], click: "showSection('cities')" },
    { title:'Hard Rock Stadium', sub:'Miami · 64,767 · Tropical World Cup atmosphere', img: STADIUM_PHOTOS['Hard Rock Stadium'], click: "showSection('cities')" },
    { title:"Levi's Stadium", sub:'San Francisco Bay Area · 68,500 · Silicon Valley', img: STADIUM_PHOTOS["Levi's Stadium"], click: "showSection('cities')" },
    { title:'NRG Stadium', sub:'Houston · 72,220 · Space City hosts the world', img: STADIUM_PHOTOS['NRG Stadium'], click: "showSection('cities')" },
    { title:'Gillette Stadium', sub:'Boston · 65,878 · New England football fortress', img: STADIUM_PHOTOS['Gillette Stadium'], click: "showSection('cities')" },
    { title:'Lincoln Financial Field', sub:"Philadelphia · 69,176 · City of Brotherly Love", img: STADIUM_PHOTOS['Lincoln Financial Field'], click: "showSection('cities')" },
    { title:'BMO Field', sub:"Toronto · 30,000 · Canada's premier football stadium", img: STADIUM_PHOTOS['BMO Field'], click: "showSection('cities')" },
    { title:'BC Place', sub:'Vancouver · 54,500 · Mountains meet ocean', img: STADIUM_PHOTOS['BC Place'], click: "showSection('cities')" },
    { title:'Estadio Akron', sub:'Guadalajara · 49,850 · Shaped like a volcano', img: STADIUM_PHOTOS['Estadio Akron'], click: "showSection('cities')" },
    { title:'Estadio BBVA', sub:'Monterrey · 53,500 · Sierra Madre mountain backdrop', img: STADIUM_PHOTOS['Estadio BBVA'], click: "showSection('cities')" },
  ].filter(g => g.img);

  const CITY_GALLERY = Object.entries(CITY_PHOTOS).map(([city, img]) => ({
    title: city, sub: HOST_CITIES.find(c => c.city === city)?.stadium || '', img,
    click: `showCityDetail('${city}')`,
  }));

  el.innerHTML = `
    <div class="scores-section-label" style="margin-bottom:1rem">⚽ World Cup 2026 — Match Photos</div>
    <div class="gallery-grid">${MATCH_PHOTOS.map(g => galleryCard(g, 'onclick="showSection(\'scores\')"')).join('')}
    </div>

    <div class="scores-section-label" style="margin:2rem 0 1rem">🏟 Host Stadiums</div>
    <div class="gallery-grid">${GALLERY.map(g => galleryCard(g, `onclick="${g.click}"`)).join('')}</div>

    <div class="scores-section-label" style="margin:2rem 0 1rem">🌆 Host Cities</div>
    <div class="gallery-grid">${CITY_GALLERY.map(g => galleryCard(g, `onclick="${g.click}"`)).join('')}</div>`;
}

// ── Nav ───────────────────────────────────────────────────────────────────
window.showSection = function(name) {
  state.activeSection = name;
  document.querySelectorAll('.main-section').forEach(s => s.style.display = s.id === `section-${name}` ? 'block' : 'none');
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.dataset.section === name));
  window.updateBottomNav(name);
  window.scrollTo({ top:0, behavior:'smooth' });
  if (name === 'map') setTimeout(initMap, 100);
  if (name === 'bracket') renderBracket();
  if (name === 'stats') renderStats();
  if (name === 'gallery') renderGallery();
};

window.updateBottomNav = function(name) {
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.id === `bnav-${name}`));
};

// ── AI functions ──────────────────────────────────────────────────────────
window.selectMatch = (id) => window.showMatchDetail(id);

window.generateAnalysis = async function() {
  if (!state.selectedMatch) { toast('Select a match first.', 'error'); return; }
  const btn = $('btn-analysis');
  btn.disabled = true; btn.textContent = '✦ Generating…';
  await streamMatchAnalysis(state.selectedMatch, $('commentary-body'));
  btn.disabled = false; btn.textContent = '✦ Generate Analysis';
};

window.generateDigest = async function() {
  const btn = $('btn-digest');
  btn.disabled = true; btn.textContent = '✦ Writing…';
  await streamDailyDigest(state.matches, $('digest-body'));
  btn.disabled = false; btn.textContent = '✦ Daily Digest';
};

window.summarise = async function(id) {
  const article = state.news.find(a => a.id === id);
  if (!article) return;
  const el = $(`summary-${id}`);
  el.innerHTML = '<span class="news-loading">✦ Summarising…</span>';
  try {
    const s = await summariseArticle(article.headline, article.description);
    article.aiSummary = s; state.newsExpanded.add(id); el.textContent = s;
  } catch (e) { el.textContent = '⚠ ' + (e.message || e); }
};

// ── Config ────────────────────────────────────────────────────────────────
window.openConfig  = () => { $('config-key').value = getKey(); $('config-modal').classList.add('open'); };
window.closeConfig = () => $('config-modal').classList.remove('open');
window.saveConfig  = () => {
  const key = $('config-key').value.trim();
  if (key) { localStorage.setItem('claude_api_key', key); toast('API key saved.', 'success'); }
  else     { localStorage.removeItem('claude_api_key'); toast('API key cleared.'); }
  window.closeConfig(); renderNews();
};

// ── Refresh ───────────────────────────────────────────────────────────────
window.refresh = async function() {
  toast('Refreshing live data…');
  const [matches, standings, news] = await Promise.all([fetchScoreboard(), fetchStandings(), fetchNews(12)]);
  state.matches = matches; state.standings = standings; state.news = news;
  renderScores(); renderStandings(); renderNews(); renderTeams(); updateHeroStats();
};
window.refreshNews = () => fetchNews(12).then(n => { state.news = n; renderNews(); });

function updateHeroStats() {
  const live = state.matches.filter(m => m.status === 'in').length;
  $('stat-live').textContent  = live;
  $('stat-today').textContent = state.matches.length;
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function init() {
  window.showSection('scores');
  renderCities();
  renderBracket();

  renderStats();

  const [matches, standings, news] = await Promise.all([fetchScoreboard(), fetchStandings(), fetchNews(12)]);
  state.matches = matches; state.standings = standings; state.news = news;
  renderScores(); renderStandings(); renderNews(); updateHeroStats();

  fetchSchedule().then(schedule => {
    state.schedule = schedule;
    renderSchedule(); renderTeams(); renderBracket();
    if (state.activeSection === 'stats') renderStats();
    fetchLiveTournamentStats();

    // Fetch pre-match odds for unplayed group stage matches to power predicted standings.
    // Runs in background; bracket re-renders when odds arrive.
    const unplayedGroupIds = schedule
      .filter(m => m.status === 'pre' && m.round === 'Group Stage')
      .map(m => m.id);
    if (unplayedGroupIds.length) {
      fetchPredictions(unplayedGroupIds).then(odds => {
        state.matchOdds = odds;
        if (state.activeSection === 'bracket') renderBracket();
      });
    }
  });

  if ($('ai-no-key-hint') && getKey()) $('ai-no-key-hint').style.display = 'none';

  setInterval(async () => {
    state.matches = await fetchScoreboard();
    renderScores(); updateHeroStats();
  }, 60_000);
}

init();
