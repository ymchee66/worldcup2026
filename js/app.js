import { fetchScoreboard, fetchStandings, fetchNews, fetchSchedule } from './api.js';
import { streamMatchAnalysis, streamDailyDigest, summariseArticle } from './ai.js';

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  matches: [], standings: [], news: [], schedule: [],
  activeSection: 'scores', selectedMatch: null, newsExpanded: new Set(),
  map: null,
};

// ── Host cities (full data) ───────────────────────────────────────────────
const HOST_CITIES = [
  {
    city: 'New York / New Jersey', country: 'USA', flag: '🇺🇸',
    stadium: 'MetLife Stadium', capacity: 82500, matches: 8,
    coords: [40.8135, -74.0745],
    highlight: 'Hosts the World Cup Final',
    description: 'The world\'s media capital hosts the biggest game on Earth. MetLife Stadium sits in the New Jersey Meadowlands, minutes from Manhattan via NJ Transit.',
    transport: '🚂 NJ Transit from Penn Station (20 min) · ⛴ NY Waterway ferry from Midtown',
    tourist: [
      { name: 'Times Square', emoji: '🌟', note: 'Neon heart of the world' },
      { name: 'Central Park', emoji: '🌳', note: '843 acres in midtown Manhattan' },
      { name: 'Statue of Liberty', emoji: '🗽', note: 'Ferry from Battery Park' },
      { name: 'Brooklyn Bridge', emoji: '🌉', note: 'Walk across for skyline views' },
      { name: 'MoMA / Met Museum', emoji: '🎨', note: 'World-class art collections' },
      { name: 'Broadway Shows', emoji: '🎭', note: 'Book ahead for big shows' },
    ],
  },
  {
    city: 'Los Angeles', country: 'USA', flag: '🇺🇸',
    stadium: 'SoFi Stadium', capacity: 70240, matches: 8,
    coords: [33.9535, -118.3392],
    highlight: 'Hosts the Opening Ceremony',
    description: 'Hollywood glamour meets world football. SoFi Stadium in Inglewood is one of the most technologically advanced venues ever built, featuring a translucent roof.',
    transport: '🚌 LAX Shuttle + Uber/Lyft · 🚇 Metro K-Line (future) — plan ahead, LA traffic is notorious',
    tourist: [
      { name: 'Hollywood Walk of Fame', emoji: '⭐', note: 'Hollywood Blvd' },
      { name: 'Santa Monica Pier', emoji: '🎡', note: 'Pacific Ocean views' },
      { name: 'Griffith Observatory', emoji: '🔭', note: 'Free, iconic LA views' },
      { name: 'Getty Center', emoji: '🖼', note: 'Free museum with gardens' },
      { name: 'Venice Beach', emoji: '🏄', note: 'Boardwalk, skate park' },
      { name: 'Universal Studios', emoji: '🎬', note: 'Half-day theme park' },
    ],
  },
  {
    city: 'Dallas', country: 'USA', flag: '🇺🇸',
    stadium: 'AT&T Stadium', capacity: 80000, matches: 7,
    coords: [32.7473, -97.0945],
    highlight: 'Largest seating capacity in the tournament',
    description: 'AT&T Stadium in Arlington is known as "Jerry World" — a cathedral of American sport with a retractable roof and massive video boards.',
    transport: '🚗 Primarily car/rideshare · Trinity Railway Express from downtown Dallas',
    tourist: [
      { name: 'Sixth Floor Museum', emoji: '📖', note: 'JFK assassination history, Dealey Plaza' },
      { name: 'Deep Ellum', emoji: '🎵', note: 'Legendary music and food district' },
      { name: 'Dallas Arboretum', emoji: '🌸', note: 'Stunning botanical gardens' },
      { name: 'Reunion Tower', emoji: '🗼', note: 'GeO-Deck 360° views' },
      { name: 'Fort Worth Stockyards', emoji: '🤠', note: '30 min from Dallas — true Texas' },
    ],
  },
  {
    city: 'San Francisco Bay Area', country: 'USA', flag: '🇺🇸',
    stadium: "Levi's Stadium", capacity: 68500, matches: 6,
    coords: [37.4034, -121.9697],
    highlight: 'Silicon Valley meets world football',
    description: 'Levi\'s Stadium in Santa Clara hosts World Cup matches in the heart of Silicon Valley, with Golden Gate views on clear days.',
    transport: '🚇 VTA Light Rail from Santa Clara Station · 🚂 Caltrain to nearby stops',
    tourist: [
      { name: 'Golden Gate Bridge', emoji: '🌉', note: 'Walk or bike across' },
      { name: 'Alcatraz Island', emoji: '⚓', note: 'Book ferry tickets weeks ahead' },
      { name: 'Fisherman\'s Wharf', emoji: '🦀', note: 'Clam chowder in sourdough bowls' },
      { name: 'Napa / Sonoma Valley', emoji: '🍷', note: 'World-famous wine country, 1hr north' },
      { name: 'Muir Woods', emoji: '🌲', note: 'Ancient redwood forest, 40 min' },
    ],
  },
  {
    city: 'Miami', country: 'USA', flag: '🇺🇸',
    stadium: 'Hard Rock Stadium', capacity: 64767, matches: 6,
    coords: [25.9580, -80.2389],
    highlight: 'Tropical World Cup vibes',
    description: 'Hard Rock Stadium in Miami Gardens brings tropical energy to the World Cup. Miami\'s Latin culture creates a uniquely festive atmosphere for international football.',
    transport: '🚗 Mainly rideshare · Tri-Rail from downtown Miami',
    tourist: [
      { name: 'South Beach', emoji: '🏖', note: 'Art Deco District + Ocean Drive' },
      { name: 'Wynwood Walls', emoji: '🎨', note: 'World-famous street art district' },
      { name: 'Little Havana', emoji: '🎺', note: 'Calle Ocho, dominos, Cuban food' },
      { name: 'Everglades National Park', emoji: '🐊', note: 'Airboat tours, 45 min away' },
      { name: 'Vizcaya Museum', emoji: '🏛', note: 'Italian Renaissance villa' },
    ],
  },
  {
    city: 'Atlanta', country: 'USA', flag: '🇺🇸',
    stadium: 'Mercedes-Benz Stadium', capacity: 71000, matches: 6,
    coords: [33.7554, -84.4010],
    highlight: 'Home of the 1994 World Cup and Olympics',
    description: 'Mercedes-Benz Stadium\'s retractable petal roof is an engineering marvel. Atlanta\'s rich civil rights history and Southern hospitality make it a unique World Cup destination.',
    transport: '🚇 MARTA Rail (Blue/Green) to Vine City or GWCC/CNN Center',
    tourist: [
      { name: 'MLK National Historic Site', emoji: '✊', note: 'Civil rights pilgrimage, must-visit' },
      { name: 'Georgia Aquarium', emoji: '🐋', note: 'World\'s largest aquarium' },
      { name: 'World of Coca-Cola', emoji: '🥤', note: 'Iconic brand museum' },
      { name: 'Centennial Olympic Park', emoji: '🏅', note: 'Legacy of 1996 Summer Olympics' },
      { name: 'Ponce City Market', emoji: '🛍', note: 'Food hall + rooftop amusement park' },
    ],
  },
  {
    city: 'Seattle', country: 'USA', flag: '🇺🇸',
    stadium: 'Lumen Field', capacity: 69000, matches: 6,
    coords: [47.5952, -122.3316],
    highlight: 'One of the loudest stadiums on Earth',
    description: 'Lumen Field, legendary for its deafening crowd noise, sits in SODO with views of Elliott Bay and the Olympic Mountains. Seattle is a gateway to Pacific Northwest adventure.',
    transport: '🚊 Link Light Rail (1st & King/International Dist station, 10 min walk)',
    tourist: [
      { name: 'Pike Place Market', emoji: '🐟', note: 'Fish-throwing since 1907' },
      { name: 'Space Needle', emoji: '🛸', note: '1962 World\'s Fair icon' },
      { name: 'Chihuly Garden & Glass', emoji: '🌈', note: 'Stunning glass art' },
      { name: 'Mount Rainier', emoji: '🏔', note: '14,411 ft volcano, 2hr drive' },
      { name: 'Capitol Hill', emoji: '🎸', note: 'Music bars, coffee, culture' },
    ],
  },
  {
    city: 'Boston', country: 'USA', flag: '🇺🇸',
    stadium: 'Gillette Stadium', capacity: 65878, matches: 6,
    coords: [42.0909, -71.2643],
    highlight: 'America\'s most historic city',
    description: 'Gillette Stadium in Foxborough brings the World Cup to New England, home of some of the most passionate sports fans in America. Boston is a living history museum.',
    transport: '🚂 Commuter Rail from South Station (40 min) on game days',
    tourist: [
      { name: 'Freedom Trail', emoji: '🏛', note: '16 historic sites, 2.5 mile walk' },
      { name: 'Fenway Park', emoji: '⚾', note: 'Oldest MLB ballpark, tours available' },
      { name: 'Harvard & MIT', emoji: '🎓', note: 'Free campus walks in Cambridge' },
      { name: 'Boston Harbor Islands', emoji: '⛵', note: 'Ferry from Long Wharf' },
      { name: 'Cape Cod', emoji: '🦞', note: 'Lobster rolls and beaches, 90 min' },
    ],
  },
  {
    city: 'Houston', country: 'USA', flag: '🇺🇸',
    stadium: 'NRG Stadium', capacity: 72220, matches: 6,
    coords: [29.6847, -95.4107],
    highlight: 'Space City hosts the world',
    description: 'NRG Stadium pioneered the retractable roof concept. Houston\'s extraordinary diversity — 145 languages spoken — gives it one of the most vibrant football fan cultures in North America.',
    transport: '🚇 METRORail Red Line to Reliant Park Station',
    tourist: [
      { name: 'NASA Johnson Space Center', emoji: '🚀', note: 'See a real Saturn V rocket' },
      { name: 'Museum District', emoji: '🏛', note: 'Free Thursdays at many museums' },
      { name: 'Buffalo Bayou Park', emoji: '🌿', note: 'Urban oasis in the heart of the city' },
      { name: 'Kemah Boardwalk', emoji: '🎢', note: 'Waterfront dining and rides, 30 min' },
      { name: 'Galveston Island', emoji: '🏝', note: 'Beach + historic downtown, 1hr' },
    ],
  },
  {
    city: 'Kansas City', country: 'USA', flag: '🇺🇸',
    stadium: 'Arrowhead Stadium', capacity: 76416, matches: 6,
    coords: [39.0489, -94.4839],
    highlight: 'BBQ capital meets the beautiful game',
    description: 'Arrowhead Stadium, one of the NFL\'s crown jewels, sits in the "Sports Complex" alongside Kauffman Stadium. Kansas City BBQ is reason enough to visit.',
    transport: '🚗 Mainly rideshare from downtown KC (25 min)',
    tourist: [
      { name: 'Kansas City BBQ', emoji: '🍖', note: 'Arthur Bryant\'s, Joe\'s, Gates — debate is eternal' },
      { name: 'Country Club Plaza', emoji: '🏰', note: 'Spanish-style outdoor shopping' },
      { name: 'Nelson-Atkins Museum', emoji: '🖼', note: 'Free world-class art collection' },
      { name: 'River Market & Jazz District', emoji: '🎷', note: 'KC invented American jazz' },
      { name: 'Union Station', emoji: '🚉', note: 'Grand Beaux-Arts architecture + exhibits' },
    ],
  },
  {
    city: 'Philadelphia', country: 'USA', flag: '🇺🇸',
    stadium: 'Lincoln Financial Field', capacity: 69176, matches: 6,
    coords: [39.9007, -75.1674],
    highlight: 'City of Brotherly Love',
    description: 'Philadelphia hosted the first international soccer game in US history. Lincoln Financial Field, home of the Eagles, sits in South Philly\'s sports complex alongside Citizens Bank Park.',
    transport: '🚇 SEPTA Broad Street Line to AT&T Station (10 min walk)',
    tourist: [
      { name: 'Independence Hall & Liberty Bell', emoji: '🔔', note: 'Birthplace of American democracy' },
      { name: 'Rocky Steps at the Art Museum', emoji: '🥊', note: 'Run them. You must.' },
      { name: 'Reading Terminal Market', emoji: '🥨', note: 'Best cheesesteaks and soft pretzels' },
      { name: 'Eastern State Penitentiary', emoji: '👻', note: 'Hauntingly beautiful ruin' },
      { name: 'Valley Forge', emoji: '⛺', note: 'Revolutionary War history, 30 min' },
    ],
  },
  {
    city: 'Toronto', country: 'Canada', flag: '🇨🇦',
    stadium: 'BMO Field', capacity: 30000, matches: 6,
    coords: [43.6333, -79.4186],
    highlight: 'Canada\'s largest city hosts its first World Cup',
    description: 'BMO Field on the Lake Ontario waterfront is Canada\'s premier football stadium. Toronto\'s incredible multiculturalism — over 200 languages spoken — creates an electrifying atmosphere.',
    transport: '🚌 TTC 509/511 streetcar from Union Station · 🚶 20 min walk from Exhibition GO Station',
    tourist: [
      { name: 'CN Tower', emoji: '🗼', note: 'Glass floor EdgeWalk experience' },
      { name: 'Niagara Falls', emoji: '💧', note: 'Under 2 hours by car — absolutely do it' },
      { name: 'Kensington Market', emoji: '🌍', note: 'Bohemian neighbourhood, world food' },
      { name: 'Royal Ontario Museum', emoji: '🦕', note: 'Dinosaurs + world cultures' },
      { name: 'Distillery Historic District', emoji: '🥃', note: 'Victorian industrial art + dining' },
    ],
  },
  {
    city: 'Vancouver', country: 'Canada', flag: '🇨🇦',
    stadium: 'BC Place', capacity: 54500, matches: 6,
    coords: [49.2768, -123.1118],
    highlight: 'Mountains meet ocean — most scenic venue',
    description: 'BC Place\'s retractable roof and mountain backdrop make it one of the most beautiful venues in world football. Vancouver\'s mix of Pacific Rim cultures creates a passionate football scene.',
    transport: '🚇 SkyTrain Expo/Millennium to Stadium-Chinatown (direct)',
    tourist: [
      { name: 'Stanley Park', emoji: '🌲', note: '1,000-acre forest on ocean peninsula' },
      { name: 'Granville Island', emoji: '🎨', note: 'Public market + artisan studios' },
      { name: 'Whistler', emoji: '⛷', note: '2hr north — world\'s best ski resort' },
      { name: 'Capilano Suspension Bridge', emoji: '🌉', note: 'Treetop adventure in rainforest' },
      { name: 'Grouse Mountain', emoji: '🏔', note: 'Gondola + city views, 30 min' },
    ],
  },
  {
    city: 'Mexico City', country: 'Mexico', flag: '🇲🇽',
    stadium: 'Estadio Azteca', capacity: 87523, matches: 5,
    coords: [19.3029, -99.1506],
    highlight: 'Only stadium to host 3 World Cup games (1970, 1986, 2026)',
    description: 'The legendary Azteca — where Pelé lifted the trophy in 1970 and Maradona\'s "Hand of God" happened in 1986 — roars again. At 7,350 ft altitude, opponents beware.',
    transport: '🚇 Metro Line 2 to Tasqueña, then Tren Ligero to Estadio Azteca',
    tourist: [
      { name: 'Teotihuacan Pyramids', emoji: '🏛', note: '30 mi northeast — climb the Pyramid of the Sun' },
      { name: 'Frida Kahlo Museum', emoji: '🎨', note: 'La Casa Azul in Coyoacán' },
      { name: 'Chapultepec Castle & Park', emoji: '🏰', note: 'Hilltop castle with city views' },
      { name: 'Zócalo', emoji: '🇲🇽', note: 'World\'s second-largest city square' },
      { name: 'Xochimilco', emoji: '🚣', note: 'Ancient floating gardens by trajinera' },
    ],
  },
  {
    city: 'Guadalajara', country: 'Mexico', flag: '🇲🇽',
    stadium: 'Estadio Akron', capacity: 49850, matches: 5,
    coords: [20.6858, -103.4669],
    highlight: 'Tequila, mariachi & the beautiful game',
    description: 'Estadio Akron (Chivas Stadium) is a masterpiece of modern architecture, shaped like a volcano. Guadalajara is the birthplace of mariachi music and tequila — the most Mexican of Mexican cities.',
    transport: '🚌 SITEUR light rail + bus connections from city center',
    tourist: [
      { name: 'Hospicio Cabañas', emoji: '🎨', note: 'UNESCO site — Orozco murals' },
      { name: 'Tlaquepaque', emoji: '🛍', note: 'Artisan crafts and mezcal bars' },
      { name: 'Tequila Town', emoji: '🥃', note: '1hr drive — distillery tours at Patron, Jose Cuervo' },
      { name: 'Lake Chapala', emoji: '🌅', note: 'Mexico\'s largest lake, 45 min south' },
      { name: 'Guadalajara Cathedral', emoji: '⛪', note: 'Twin-spired 16th century masterpiece' },
    ],
  },
  {
    city: 'Monterrey', country: 'Mexico', flag: '🇲🇽',
    stadium: 'Estadio BBVA', capacity: 53500, matches: 5,
    coords: [25.6693, -100.2437],
    highlight: 'Mountain backdrop like no other',
    description: 'Estadio BBVA (Rayados Stadium) is framed by the dramatic Sierra Madre Oriental mountains, creating one of world football\'s most striking visual settings. Monterrey is Mexico\'s industrial powerhouse.',
    transport: '🚇 Metro Line 2 + bus connections · shuttle buses on match days',
    tourist: [
      { name: 'Macroplaza', emoji: '🏛', note: 'One of the world\'s largest public squares' },
      { name: 'Parque Fundidora', emoji: '🏭', note: 'Former steel mill turned beautiful park' },
      { name: 'Barrio Antiguo', emoji: '🎶', note: 'Bohemian bars, galleries, nightlife' },
      { name: 'Cola de Caballo', emoji: '💧', note: 'Stunning waterfall, 1hr from city' },
      { name: 'Grutas de Garcia', emoji: '🦇', note: 'Ancient cave system, cable car access' },
    ],
  },
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

// ── Match card renderer (shared) ──────────────────────────────────────────
function matchCardHTML(m, clickable = true) {
  const statusCls = m.status === 'in' ? 'status-live' : m.status === 'post' ? 'status-ft' : 'status-ns';
  const statusLbl = m.status === 'in' ? (m.clock || 'LIVE')
    : m.status === 'post' ? 'FT'
    : matchLocalTime(m.date);
  const roundLabel = [m.round, m.group].filter(Boolean).join(' · ');
  const hasScore = m.home?.score !== null && m.away?.score !== null && m.status !== 'pre';
  const click = clickable ? `onclick="selectMatch('${m.id}')"` : '';
  return `<div class="card match-card" ${click} style="${clickable ? 'cursor:pointer' : ''}">
    <div class="match-status">
      <span class="status-badge ${statusCls}">${statusLbl}</span>
      <span class="match-time">${matchLocalDate(m.date)}</span>
    </div>
    ${roundLabel ? `<div class="match-round">${roundLabel}</div>` : ''}
    <div class="match-teams">
      <div class="team">
        <span class="team-flag">${m.away?.flag || '⚽'}</span>
        <span class="team-name">${m.away?.name || '?'}</span>
      </div>
      <div class="match-score">
        <div class="score-main">
          ${hasScore
            ? `${m.away?.score}<span class="score-sep"> – </span>${m.home?.score}`
            : `<span style="color:var(--text-dim);font-size:0.95rem">vs</span>`}
        </div>
      </div>
      <div class="team">
        <span class="team-flag">${m.home?.flag || '⚽'}</span>
        <span class="team-name">${m.home?.name || '?'}</span>
      </div>
    </div>
    ${m.venue ? `<div class="match-venue">📍 ${m.venue}${m.broadcast ? ' · 📺 ' + m.broadcast : ''}</div>` : ''}
  </div>`;
}

// ── Render: Scoreboard ────────────────────────────────────────────────────
function renderScores() {
  const el = $('scores-container');
  const live  = state.matches.filter(m => m.status === 'in');
  const other = state.matches.filter(m => m.status !== 'in');

  if (!state.matches.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">⚽</span><span>No matches today — check the Schedule tab.</span></div>`;
    return;
  }

  let html = '';
  if (live.length) {
    html += `<div class="scores-section-label live-label">🔴 Live Now</div>
             <div class="scores-grid" style="margin-bottom:1.5rem">${live.map(m => matchCardHTML(m)).join('')}</div>`;
  }
  if (other.length) {
    html += `<div class="scores-section-label">📅 Today's Matches</div>
             <div class="scores-grid">${other.map(m => matchCardHTML(m)).join('')}</div>`;
  }
  el.innerHTML = html;

  $('live-count').textContent = live.length ? `${live.length} LIVE` : 'LIVE';
}

// ── Render: Standings ─────────────────────────────────────────────────────
function renderStandings() {
  const el = $('standings-container');
  if (!state.standings.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">📊</span><span>Loading standings…</span></div>`;
    return;
  }

  // Compute goals stats for sparklines
  const totalGoals = state.standings.reduce((s, g) => s + g.entries.reduce((gs, e) => gs + (e.gf || 0), 0), 0);

  el.innerHTML = state.standings.map(g => {
    const maxPts = Math.max(...g.entries.map(e => e.pts), 1);
    return `<div class="card group-card">
      <div class="group-name">${g.name}</div>
      <table class="standings-table">
        <thead><tr>
          <th style="width:45%">Team</th>
          <th>MP</th>
          <th class="col-hide-mobile">W</th>
          <th class="col-hide-mobile">D</th>
          <th class="col-hide-mobile">L</th>
          <th class="col-hide-mobile">GD</th>
          <th>Pts</th>
          <th class="col-hide-mobile" style="min-width:60px"></th>
        </tr></thead>
        <tbody>
          ${g.entries.map((e, i) => `
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
              <td class="col-hide-mobile">
                <div class="pts-bar-wrap">
                  <div class="pts-bar ${i < 2 ? 'pts-bar-qualify' : ''}" style="width:${Math.round((e.pts/maxPts)*100)}%"></div>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('');

  // Goals scored visualization
  renderGoalsViz(totalGoals);
}

function renderGoalsViz(totalGoals) {
  const el = $('goals-viz');
  if (!el || !state.standings.length) return;
  const goalsPerGroup = state.standings.map(g => ({
    name: g.name.replace('Group ', ''),
    goals: g.entries.reduce((s, e) => s + (e.gf || 0), 0),
  }));
  const maxG = Math.max(...goalsPerGroup.map(g => g.goals), 1);
  el.innerHTML = `<div class="viz-title">Goals Scored by Group</div>
    <div class="bar-chart">
      ${goalsPerGroup.map(g => `
        <div class="bar-row">
          <div class="bar-label">Grp ${g.name}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.round((g.goals/maxG)*100)}%"></div>
          </div>
          <div class="bar-val">${g.goals}</div>
        </div>`).join('')}
    </div>
    <div class="viz-sub">Total goals so far: <strong>${totalGoals}</strong></div>`;
}

// ── Render: News ──────────────────────────────────────────────────────────
function renderNews() {
  const el = $('news-container');
  if (!state.news.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">📰</span><span>Loading news…</span></div>`;
    return;
  }
  el.innerHTML = state.news.slice(0, 12).map(a => {
    const tag = a.categories[0] || 'World Cup 2026';
    return `<div class="card news-card" id="news-${a.id}">
      <div class="news-meta">
        <span class="news-tag">${tag}</span>
        <span class="news-time">${relativeTime(a.published)}</span>
      </div>
      <div class="news-title">${a.headline}</div>
      <div class="news-summary" id="summary-${a.id}">
        ${state.newsExpanded.has(a.id)
          ? (a.aiSummary || a.description || '')
          : (a.description ? a.description.slice(0, 140) + (a.description.length > 140 ? '…' : '') : '')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap">
        ${getKey() ? `<button class="section-link" onclick="summarise('${a.id}')">✦ AI Summary</button>` : '<span class="ai-badge">Set API key for AI summaries</span>'}
        ${a.links ? `<a href="${a.links}" target="_blank" rel="noopener" class="section-link">Read more →</a>` : ''}
      </div>
    </div>`;
  }).join('');
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
    const isPast  = matchDate < today;
    const isToday = matchDate.getTime() === today.getTime();
    return `<div style="margin-bottom:1.75rem">
      <div class="schedule-day-header ${isToday ? 'today' : isPast ? 'past' : ''}">${isToday ? '📍 Today' : date}</div>
      <div class="scores-grid">${ms.map(m => matchCardHTML(m, false)).join('')}</div>
    </div>`;
  }).join('');
}

// ── Render: Teams ─────────────────────────────────────────────────────────
function renderTeams() {
  const el = $('teams-container');
  const teamMap = {};
  for (const m of [...state.schedule, ...state.matches]) {
    for (const side of [m.home, m.away]) {
      if (side?.name && !teamMap[side.name]) {
        teamMap[side.name] = { name: side.name, flag: side.flag, group: m.group || '' };
      }
    }
  }
  // Also include from standings
  for (const g of state.standings) {
    for (const e of g.entries) {
      if (!teamMap[e.name]) teamMap[e.name] = { name: e.name, flag: e.flag, group: g.name };
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
  const ungrouped = [];
  for (const t of teams) {
    if (t.group) { if (!byGroup[t.group]) byGroup[t.group] = []; byGroup[t.group].push(t); }
    else ungrouped.push(t);
  }

  let html = `<div class="teams-summary">
    <div class="info-card"><div class="info-val">${teams.length}</div><div class="info-lbl">Nations</div></div>
    <div class="info-card"><div class="info-val">12</div><div class="info-lbl">Groups</div></div>
    <div class="info-card"><div class="info-val">3</div><div class="info-lbl">Host Nations</div></div>
    <div class="info-card"><div class="info-val">6</div><div class="info-lbl">Confederations</div></div>
  </div>`;

  if (Object.keys(byGroup).length) {
    const sorted = Object.entries(byGroup).sort(([a],[b]) => a.localeCompare(b));
    html += `<div class="groups-grid">` + sorted.map(([grp, ts]) => {
      const groupStanding = state.standings.find(s => s.name === grp);
      return `<div class="card group-card">
        <div class="group-name">${grp}</div>
        ${ts.map(t => {
          const standing = groupStanding?.entries?.find(e => e.name === t.name);
          return `<div class="team-list-row" onclick="showTeamDetail('${t.name}')" style="cursor:pointer">
            <span style="font-size:1.25rem">${t.flag}</span>
            <span style="flex:1;font-weight:500;font-size:0.87rem">${t.name}</span>
            ${standing ? `<span style="font-size:0.72rem;color:var(--text-dim)">${standing.gp}GP · <strong style="color:var(--text)">${standing.pts}pts</strong></span>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    }).join('') + `</div>`;
  } else {
    html += `<div class="teams-grid">${teams.map(t => `
      <div class="card team-card" onclick="showTeamDetail('${t.name}')" style="cursor:pointer">
        <div class="team-card-flag">${t.flag}</div>
        <div class="team-card-name">${t.name}</div>
      </div>`).join('')}</div>`;
  }
  el.innerHTML = html;
}

// ── Render: Host Cities ───────────────────────────────────────────────────
function renderCities() {
  const el = $('cities-container');
  const byCountry = {};
  for (const c of HOST_CITIES) {
    if (!byCountry[c.country]) byCountry[c.country] = [];
    byCountry[c.country].push(c);
  }
  const totalCap = HOST_CITIES.reduce((s,c) => s + c.capacity, 0);
  el.innerHTML = `
    <div class="teams-summary">
      <div class="info-card"><div class="info-val">16</div><div class="info-lbl">Host Cities</div></div>
      <div class="info-card"><div class="info-val">3</div><div class="info-lbl">Host Nations</div></div>
      <div class="info-card"><div class="info-val">${(totalCap/1e6).toFixed(1)}M</div><div class="info-lbl">Total Capacity</div></div>
      <div class="info-card"><div class="info-val">104</div><div class="info-lbl">Total Matches</div></div>
    </div>
    ${Object.entries(byCountry).map(([country, cities]) => `
      <div style="margin-bottom:2rem">
        <div class="scores-section-label">${cities[0].flag} ${country} — ${cities.length} cities</div>
        <div class="cities-grid">
          ${cities.map(c => `
            <div class="card city-card" onclick="showCityDetail('${c.city}')" style="cursor:pointer">
              <div class="city-flag">${c.flag}</div>
              <div class="city-info">
                <div class="city-name">${c.city}</div>
                <div class="city-stadium">${c.stadium}</div>
                ${c.highlight ? `<div style="font-size:0.7rem;color:var(--gold);opacity:0.7;margin-bottom:0.35rem">★ ${c.highlight}</div>` : ''}
                <div class="city-meta">
                  <span>🏟 ${c.capacity.toLocaleString()}</span>
                  <span>⚽ ${c.matches} matches</span>
                </div>
              </div>
              <div style="color:var(--text-dim);font-size:0.7rem;align-self:center;flex-shrink:0">›</div>
            </div>`).join('')}
        </div>
      </div>`).join('')}`;
}

// ── City detail modal ─────────────────────────────────────────────────────
window.showCityDetail = function(cityName) {
  const city = HOST_CITIES.find(c => c.city === cityName);
  if (!city) return;

  const cityMatches = state.schedule.filter(m =>
    m.venue && m.venue.toLowerCase().includes(city.stadium.split(' ')[0].toLowerCase())
  );

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city.stadium + ', ' + city.city)}`;

  $('detail-modal-title').textContent = `${city.flag} ${city.city}`;
  $('detail-modal-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-hero-stat">${city.stadium}</div>
      ${city.highlight ? `<div class="detail-badge">★ ${city.highlight}</div>` : ''}
      <p style="font-size:0.85rem;color:var(--text-dim);line-height:1.65;margin-top:0.75rem">${city.description}</p>
    </div>

    <div class="detail-stats-row">
      <div class="detail-stat"><div class="detail-stat-val">${city.capacity.toLocaleString()}</div><div class="detail-stat-lbl">Capacity</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${city.matches}</div><div class="detail-stat-lbl">Matches Here</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${city.country}</div><div class="detail-stat-lbl">Country</div></div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🚇 Getting There</div>
      <p style="font-size:0.82rem;color:var(--text-dim)">${city.transport}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🎯 Top Attractions</div>
      <div class="tourist-grid">
        ${city.tourist.map(t => `
          <div class="tourist-card">
            <div class="tourist-emoji">${t.emoji}</div>
            <div>
              <div class="tourist-name">${t.name}</div>
              <div class="tourist-note">${t.note}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    ${cityMatches.length ? `
    <div class="detail-section">
      <div class="detail-section-title">⚽ Matches at this Venue</div>
      <div class="scores-grid">${cityMatches.map(m => matchCardHTML(m, false)).join('')}</div>
    </div>` : ''}

    <div class="detail-section">
      <a href="${mapsUrl}" target="_blank" rel="noopener" class="detail-maps-btn">📍 Open in Google Maps</a>
    </div>`;

  $('detail-modal').classList.add('open');
};

// ── Team detail modal ─────────────────────────────────────────────────────
window.showTeamDetail = function(teamName) {
  // Find team's group/standing
  let teamGroup = null;
  let teamEntry = null;
  for (const g of state.standings) {
    const e = g.entries.find(e => e.name === teamName);
    if (e) { teamGroup = g.name; teamEntry = e; break; }
  }

  // Find from schedule
  let teamFlag = '⚽';
  const teamMatches = state.schedule.filter(m =>
    m.home?.name === teamName || m.away?.name === teamName
  );
  if (teamMatches.length) {
    const m = teamMatches[0];
    teamFlag = m.home?.name === teamName ? m.home.flag : m.away.flag;
  } else if (teamEntry) {
    teamFlag = teamEntry.flag;
  }

  // W/D/L from schedule
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of teamMatches) {
    if (m.status !== 'post') continue;
    const isHome = m.home?.name === teamName;
    const myScore = parseInt(isHome ? m.home.score : m.away.score) || 0;
    const oppScore = parseInt(isHome ? m.away.score : m.home.score) || 0;
    gf += myScore; ga += oppScore;
    if (myScore > oppScore) w++;
    else if (myScore === oppScore) d++;
    else l++;
  }

  const played = teamMatches.filter(m => m.status === 'post').length;

  $('detail-modal-title').textContent = `${teamFlag} ${teamName}`;
  $('detail-modal-body').innerHTML = `
    <div class="detail-section">
      <div style="font-size:4rem;text-align:center;margin-bottom:0.5rem">${teamFlag}</div>
      ${teamGroup ? `<div class="detail-badge" style="margin:0 auto 0.75rem;display:table">${teamGroup}${teamEntry ? ` · Position ${teamEntry.pos}` : ''}</div>` : ''}
    </div>

    ${teamEntry ? `
    <div class="detail-stats-row">
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.pts}</div><div class="detail-stat-lbl">Points</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.w}/${teamEntry.d}/${teamEntry.l}</div><div class="detail-stat-lbl">W / D / L</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.gf}–${teamEntry.ga}</div><div class="detail-stat-lbl">Goals</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${teamEntry.gd > 0 ? '+' : ''}${teamEntry.gd}</div><div class="detail-stat-lbl">Goal Diff</div></div>
    </div>` : (played > 0 ? `
    <div class="detail-stats-row">
      <div class="detail-stat"><div class="detail-stat-val">${w * 3 + d}</div><div class="detail-stat-lbl">Points</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${w}/${d}/${l}</div><div class="detail-stat-lbl">W / D / L</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${gf}–${ga}</div><div class="detail-stat-lbl">Goals</div></div>
    </div>` : '')}

    ${teamMatches.length ? `
    <div class="detail-section">
      <div class="detail-section-title">📅 All Matches</div>
      <div class="scores-grid">${teamMatches.map(m => matchCardHTML(m, false)).join('')}</div>
    </div>` : '<div class="bracket-placeholder" style="margin-top:1rem"><span>No matches found yet</span></div>'}`;

  $('detail-modal').classList.add('open');
};

window.closeDetailModal = function() {
  $('detail-modal').classList.remove('open');
};

document.addEventListener('click', e => {
  if (e.target.id === 'detail-modal') window.closeDetailModal();
  if (e.target.id === 'config-modal')  window.closeConfig();
});

// ── Map ───────────────────────────────────────────────────────────────────
let leafletMap = null;

function initMap() {
  if (leafletMap) return; // already initialized
  const mapEl = $('stadium-map');
  if (!mapEl || !window.L) return;

  leafletMap = L.map('stadium-map', { zoomControl: true, scrollWheelZoom: false })
    .setView([35, -95], 4);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CartoDB',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(leafletMap);

  const markerIcon = (label) => L.divIcon({
    className: '',
    html: `<div class="map-marker">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  HOST_CITIES.forEach(city => {
    const marker = L.marker(city.coords, { icon: markerIcon(city.flag) }).addTo(leafletMap);
    marker.bindPopup(`
      <div class="map-popup">
        <div class="map-popup-city">${city.flag} ${city.city}</div>
        <div class="map-popup-stadium">${city.stadium}</div>
        <div class="map-popup-meta">🏟 ${city.capacity.toLocaleString()} · ⚽ ${city.matches} matches</div>
        <button class="map-popup-btn" onclick="showCityDetail('${city.city}')">View Details →</button>
      </div>`, { className: 'dark-popup', maxWidth: 220 });
  });

  setTimeout(() => leafletMap.invalidateSize(), 200);
}

// ── Bracket ───────────────────────────────────────────────────────────────
function renderBracket() {
  const el = $('bracket-container');
  if (!el) return;
  const rounds = [
    { name: 'Group Stage', desc: '12 Groups of 4', teams: 48, icon: '🔵' },
    { name: 'Round of 32', desc: '24 group winners + 8 best 3rd-place teams', teams: 32, icon: '🟡' },
    { name: 'Round of 16', desc: '16 teams remain', teams: 16, icon: '🟠' },
    { name: 'Quarterfinals', desc: '8 nations chase glory', teams: 8, icon: '🔴' },
    { name: 'Semifinals', desc: 'Final four', teams: 4, icon: '🟣' },
    { name: 'Final', desc: 'MetLife Stadium, New York · Jul 19', teams: 2, icon: '🏆' },
  ];
  el.innerHTML = `
    <div class="bracket-flow">
      ${rounds.map((r, i) => `
        <div class="bracket-round">
          <div class="bracket-round-icon">${r.icon}</div>
          <div class="bracket-round-name">${r.name}</div>
          <div class="bracket-round-teams">${r.teams} teams</div>
          <div class="bracket-round-desc">${r.desc}</div>
        </div>
        ${i < rounds.length - 1 ? '<div class="bracket-arrow">→</div>' : ''}`).join('')}
    </div>
    <div class="bracket-note">
      <strong>2026 Format:</strong> First-ever 48-team World Cup. 12 groups advance top 2 plus 8 best third-place finishers to a new Round of 32.
    </div>`;
}

// ── Nav ───────────────────────────────────────────────────────────────────
window.showSection = function(name) {
  state.activeSection = name;
  document.querySelectorAll('.main-section').forEach(s => {
    s.style.display = s.id === `section-${name}` ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.section === name);
  });
  window.updateBottomNav(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'map') setTimeout(initMap, 100);
};

window.updateBottomNav = function(name) {
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `bnav-${name}`);
  });
};

// ── AI ────────────────────────────────────────────────────────────────────
window.selectMatch = function(id) {
  const m = state.matches.find(x => x.id === id);
  if (!m) return;
  state.selectedMatch = m;
  $('commentary-match').textContent = `${m.away.flag} ${m.away.name}  ${m.away.score} – ${m.home.score}  ${m.home.flag} ${m.home.name}`;
  $('commentary-body').textContent = 'Click "Generate Analysis" for an AI tactical breakdown.';
  window.showSection('ai');
};

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
  else      { localStorage.removeItem('claude_api_key'); toast('API key cleared.'); }
  window.closeConfig(); renderNews();
};

// ── Refresh ───────────────────────────────────────────────────────────────
window.refresh = async function() {
  toast('Refreshing…');
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

  renderCities(); // hardcoded — renders immediately
  renderBracket();

  const [matches, standings, news] = await Promise.all([fetchScoreboard(), fetchStandings(), fetchNews(12)]);
  state.matches = matches; state.standings = standings; state.news = news;
  renderScores(); renderStandings(); renderNews(); updateHeroStats();

  fetchSchedule().then(schedule => {
    state.schedule = schedule;
    renderSchedule(); renderTeams();
  });

  const hint = $('ai-no-key-hint');
  if (hint && getKey()) hint.style.display = 'none';

  setInterval(async () => {
    state.matches = await fetchScoreboard();
    renderScores(); updateHeroStats();
  }, 60_000);
}

init();
