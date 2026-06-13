import { fetchScoreboard, fetchStandings, fetchNews, fetchSchedule } from './api.js';
import { streamMatchAnalysis, streamDailyDigest, summariseArticle } from './ai.js';

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  matches:   [],
  standings: [],
  news:      [],
  schedule:  [],
  activeSection: 'scores',
  selectedMatch: null,
  newsExpanded: new Set(),
};

// ── Host cities (hardcoded — fixed for the tournament) ───────────────────
const HOST_CITIES = [
  { city: 'New York / New Jersey', country: 'USA',    flag: '🇺🇸', stadium: 'MetLife Stadium',        capacity: '82500',  matches: 8 },
  { city: 'Los Angeles',           country: 'USA',    flag: '🇺🇸', stadium: 'SoFi Stadium',            capacity: '70240',  matches: 8 },
  { city: 'Dallas',                country: 'USA',    flag: '🇺🇸', stadium: 'AT&T Stadium',            capacity: '80000',  matches: 7 },
  { city: 'San Francisco',         country: 'USA',    flag: '🇺🇸', stadium: "Levi's Stadium",          capacity: '68500',  matches: 6 },
  { city: 'Miami',                 country: 'USA',    flag: '🇺🇸', stadium: 'Hard Rock Stadium',       capacity: '64767',  matches: 6 },
  { city: 'Atlanta',               country: 'USA',    flag: '🇺🇸', stadium: 'Mercedes-Benz Stadium',   capacity: '71000',  matches: 6 },
  { city: 'Seattle',               country: 'USA',    flag: '🇺🇸', stadium: 'Lumen Field',             capacity: '69000',  matches: 6 },
  { city: 'Boston',                country: 'USA',    flag: '🇺🇸', stadium: 'Gillette Stadium',        capacity: '65878',  matches: 6 },
  { city: 'Houston',               country: 'USA',    flag: '🇺🇸', stadium: 'NRG Stadium',             capacity: '72220',  matches: 6 },
  { city: 'Kansas City',           country: 'USA',    flag: '🇺🇸', stadium: 'Arrowhead Stadium',       capacity: '76416',  matches: 6 },
  { city: 'Philadelphia',          country: 'USA',    flag: '🇺🇸', stadium: 'Lincoln Financial Field', capacity: '69176',  matches: 6 },
  { city: 'Toronto',               country: 'Canada', flag: '🇨🇦', stadium: 'BMO Field',               capacity: '30000',  matches: 6 },
  { city: 'Vancouver',             country: 'Canada', flag: '🇨🇦', stadium: 'BC Place',                capacity: '54500',  matches: 6 },
  { city: 'Mexico City',           country: 'Mexico', flag: '🇲🇽', stadium: 'Estadio Azteca',          capacity: '87523',  matches: 5 },
  { city: 'Guadalajara',           country: 'Mexico', flag: '🇲🇽', stadium: 'Estadio Akron',           capacity: '49850',  matches: 5 },
  { city: 'Monterrey',             country: 'Mexico', flag: '🇲🇽', stadium: 'Estadio BBVA',            capacity: '53500',  matches: 5 },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
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

// ── Render: Scoreboard ────────────────────────────────────────────────────
function renderScores() {
  const el = $('scores-container');
  const liveMatches  = state.matches.filter(m => m.status === 'in');
  const todayMatches = state.matches.filter(m => m.status !== 'in');

  if (!state.matches.length) {
    el.innerHTML = `<div class="bracket-placeholder">
      <span style="font-size:2.5rem">⚽</span>
      <span>No matches scheduled today — check the Schedule tab for upcoming fixtures.</span>
    </div>`;
    return;
  }

  const renderMatch = m => {
    const statusCls = m.status === 'in' ? 'status-live' : m.status === 'post' ? 'status-ft' : 'status-ns';
    const statusLbl = m.status === 'in'
      ? (m.clock ? `${m.clock}'` : 'LIVE')
      : m.status === 'post' ? 'FT'
      : matchLocalTime(m.date);
    const roundLabel = [m.round, m.group].filter(Boolean).join(' · ');
    return `<div class="card match-card" data-id="${m.id}" onclick="selectMatch('${m.id}')">
      <div class="match-status">
        <span class="status-badge ${statusCls}">${statusLbl}</span>
        <span class="match-time">${matchLocalDate(m.date)}</span>
      </div>
      ${roundLabel ? `<div class="match-round">${roundLabel}</div>` : ''}
      <div class="match-teams">
        <div class="team">
          <span class="team-flag">${m.away.flag}</span>
          <span class="team-name">${m.away.name}</span>
        </div>
        <div class="match-score">
          <div class="score-main">
            <span>${m.away.score}</span>
            <span class="score-sep"> – </span>
            <span>${m.home.score}</span>
          </div>
          ${m.period ? `<div class="score-period">Half ${m.period}</div>` : ''}
        </div>
        <div class="team">
          <span class="team-flag">${m.home.flag}</span>
          <span class="team-name">${m.home.name}</span>
        </div>
      </div>
      ${m.venue ? `<div class="match-venue">📍 ${m.venue}${m.broadcast ? ' · 📺 ' + m.broadcast : ''}</div>` : ''}
    </div>`;
  };

  let html = '';
  if (liveMatches.length) {
    html += `<div class="scores-section-label live-label">🔴 Live Now</div>
             <div class="scores-grid" style="margin-bottom:2rem">${liveMatches.map(renderMatch).join('')}</div>`;
  }
  if (todayMatches.length) {
    html += `<div class="scores-section-label">📅 Today's Matches</div>
             <div class="scores-grid">${todayMatches.map(renderMatch).join('')}</div>`;
  }
  el.innerHTML = html;

  const live = liveMatches.length;
  const badge = $('live-count');
  if (badge) badge.textContent = live ? `${live} LIVE` : 'LIVE';
}

// ── Render: Standings ─────────────────────────────────────────────────────
function renderStandings() {
  const el = $('standings-container');
  if (!state.standings.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">📊</span><span>Loading standings…</span></div>`;
    return;
  }

  el.innerHTML = state.standings.map(g => `
    <div class="card group-card">
      <div class="group-name">${g.name}</div>
      <table class="standings-table">
        <thead><tr>
          <th style="width:50%">Team</th>
          <th>GP</th>
          <th class="col-hide-mobile">W</th>
          <th class="col-hide-mobile">D</th>
          <th class="col-hide-mobile">L</th>
          <th>GD</th><th>Pts</th>
        </tr></thead>
        <tbody>
          ${g.entries.map((e, i) => `
            <tr>
              <td><div class="team-row">
                <span class="team-pos ${i < 2 ? 'qualified' : ''}">${e.pos}</span>
                <span class="team-flag-sm">${e.flag}</span>
                <span class="team-name-sm">${e.name}</span>
              </div></td>
              <td>${e.gp}</td>
              <td class="col-hide-mobile">${e.w}</td>
              <td class="col-hide-mobile">${e.d}</td>
              <td class="col-hide-mobile">${e.l}</td>
              <td>${e.gd > 0 ? '+' : ''}${e.gd}</td>
              <td><strong>${e.pts}</strong></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
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
    const expanded = state.newsExpanded.has(a.id);
    return `<div class="card news-card" id="news-${a.id}">
      <div class="news-meta">
        <span class="news-tag">${tag}</span>
        <span class="news-time">${relativeTime(a.published)}</span>
      </div>
      <div class="news-title">${a.headline}</div>
      <div class="news-summary" id="summary-${a.id}">
        ${expanded
          ? (a.aiSummary || a.description || '')
          : (a.description ? a.description.slice(0, 140) + (a.description.length > 140 ? '…' : '') : '')
        }
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byDate = {};
  for (const m of state.schedule) {
    const d = matchLocalDate(m.date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(m);
  }

  el.innerHTML = Object.entries(byDate).map(([date, ms]) => {
    const matchDate = new Date(ms[0].date);
    matchDate.setHours(0, 0, 0, 0);
    const isPast  = matchDate < today;
    const isToday = matchDate.getTime() === today.getTime();
    const dayLabel = isToday ? '📍 Today' : date;

    return `<div style="margin-bottom:1.75rem">
      <div class="schedule-day-header ${isToday ? 'today' : isPast ? 'past' : ''}">${dayLabel}</div>
      <div class="scores-grid">
        ${ms.map(m => {
          const statusCls = m.status === 'in' ? 'status-live' : m.status === 'post' ? 'status-ft' : 'status-ns';
          const statusLbl = m.status === 'in' ? 'LIVE'
            : m.status === 'post' ? 'FT'
            : matchLocalTime(m.date);
          const roundLabel = [m.round, m.group].filter(Boolean).join(' · ');
          const hasScore = m.home.score !== null && m.away.score !== null;
          return `<div class="card match-card">
            <div class="match-status">
              <span class="status-badge ${statusCls}">${statusLbl}</span>
              <span class="match-time">${matchLocalDate(m.date)}</span>
            </div>
            ${roundLabel ? `<div class="match-round">${roundLabel}</div>` : ''}
            <div class="match-teams">
              <div class="team">
                <span class="team-flag">${m.away.flag}</span>
                <span class="team-name">${m.away.name}</span>
              </div>
              <div class="match-score">
                ${hasScore
                  ? `<div class="score-main">${m.away.score}<span class="score-sep"> – </span>${m.home.score}</div>`
                  : `<div class="score-main" style="font-size:1.1rem;color:var(--text-dim)">vs</div>`}
              </div>
              <div class="team">
                <span class="team-flag">${m.home.flag}</span>
                <span class="team-name">${m.home.name}</span>
              </div>
            </div>
            ${m.venue ? `<div class="match-venue">📍 ${m.venue}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

// ── Render: Teams ─────────────────────────────────────────────────────────
function renderTeams() {
  const el = $('teams-container');

  // Build team list from schedule data (each match has home/away teams + round/group)
  const teamMap = {};
  for (const m of state.schedule) {
    for (const side of [m.home, m.away]) {
      if (side.name && !teamMap[side.name]) {
        teamMap[side.name] = { name: side.name, flag: side.flag, group: m.group || '' };
      }
    }
  }

  // Also pull from current matches
  for (const m of state.matches) {
    for (const side of [m.home, m.away]) {
      if (side.name && !teamMap[side.name]) {
        teamMap[side.name] = { name: side.name, flag: side.flag, group: m.group || '' };
      }
    }
  }

  const teams = Object.values(teamMap).sort((a, b) => a.name.localeCompare(b.name));

  if (!teams.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span style="font-size:2rem">🌍</span><span>Loading team data…</span></div>`;
    return;
  }

  // Group by group label
  const byGroup = {};
  const ungrouped = [];
  for (const t of teams) {
    if (t.group) {
      if (!byGroup[t.group]) byGroup[t.group] = [];
      byGroup[t.group].push(t);
    } else {
      ungrouped.push(t);
    }
  }

  const totalTeams = teams.length;
  $('stat-teams').textContent = totalTeams || 48;

  let html = `<div class="teams-summary">
    <div class="info-card">
      <div class="info-val">${totalTeams}</div>
      <div class="info-lbl">Nations Competing</div>
    </div>
    <div class="info-card">
      <div class="info-val">12</div>
      <div class="info-lbl">Groups</div>
    </div>
    <div class="info-card">
      <div class="info-val">3</div>
      <div class="info-lbl">Host Nations</div>
    </div>
    <div class="info-card">
      <div class="info-val">6</div>
      <div class="info-lbl">Confederations</div>
    </div>
  </div>`;

  if (Object.keys(byGroup).length) {
    const sortedGroups = Object.entries(byGroup).sort(([a],[b]) => a.localeCompare(b));
    html += `<div class="groups-grid">` + sortedGroups.map(([grp, ts]) => `
      <div class="card group-card">
        <div class="group-name">${grp}</div>
        ${ts.map(t => `
          <div class="team-list-row">
            <span class="team-flag-sm" style="font-size:1.3rem">${t.flag}</span>
            <span style="font-weight:600;font-size:0.9rem">${t.name}</span>
          </div>`).join('')}
      </div>`).join('') + `</div>`;
  } else {
    // fallback: alphabetical grid
    html += `<div class="teams-grid">` +
      teams.map(t => `
        <div class="card team-card">
          <div class="team-card-flag">${t.flag}</div>
          <div class="team-card-name">${t.name}</div>
        </div>`).join('') +
      `</div>`;
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

  const totalCapacity = HOST_CITIES.reduce((s, c) => s + parseInt(c.capacity), 0);

  el.innerHTML = `
    <div class="teams-summary">
      <div class="info-card">
        <div class="info-val">16</div>
        <div class="info-lbl">Host Cities</div>
      </div>
      <div class="info-card">
        <div class="info-val">3</div>
        <div class="info-lbl">Host Nations</div>
      </div>
      <div class="info-card">
        <div class="info-val">${(totalCapacity / 1000000).toFixed(1)}M</div>
        <div class="info-lbl">Total Capacity</div>
      </div>
      <div class="info-card">
        <div class="info-val">104</div>
        <div class="info-lbl">Total Matches</div>
      </div>
    </div>

    ${Object.entries(byCountry).map(([country, cities]) => `
      <div style="margin-bottom:2rem">
        <div class="scores-section-label">${cities[0].flag} ${country} — ${cities.length} ${cities.length === 1 ? 'city' : 'cities'}</div>
        <div class="cities-grid">
          ${cities.map(c => `
            <div class="card city-card">
              <div class="city-flag">${c.flag}</div>
              <div class="city-info">
                <div class="city-name">${c.city}</div>
                <div class="city-stadium">${c.stadium}</div>
                <div class="city-meta">
                  <span>🏟 ${parseInt(c.capacity).toLocaleString()} cap.</span>
                  <span>⚽ ${c.matches} matches</span>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}`;
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
};

window.updateBottomNav = function(name) {
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `bnav-${name}`);
  });
};

// ── Match selection / AI ──────────────────────────────────────────────────
window.selectMatch = function(id) {
  const m = state.matches.find(x => x.id === id);
  if (!m) return;
  state.selectedMatch = m;
  $('commentary-match').textContent = `${m.away.flag} ${m.away.name}  ${m.away.score} – ${m.home.score}  ${m.home.flag} ${m.home.name}`;
  $('commentary-body').textContent = 'Click "Generate Analysis" to get AI match commentary.';
  window.showSection('ai');
  window.updateBottomNav('ai');
};

window.generateAnalysis = async function() {
  if (!state.selectedMatch) {
    toast('Select a match first by clicking on a match card.', 'error'); return;
  }
  const btn = $('btn-analysis');
  btn.disabled = true; btn.textContent = '✦ Generating…';
  await streamMatchAnalysis(state.selectedMatch, $('commentary-body'));
  btn.disabled = false; btn.textContent = '✦ Generate Analysis';
};

window.generateDigest = async function() {
  const btn = $('btn-digest');
  btn.disabled = true; btn.textContent = '✦ Writing digest…';
  await streamDailyDigest(state.matches, $('digest-body'));
  btn.disabled = false; btn.textContent = '✦ Daily Digest';
};

window.summarise = async function(id) {
  const article = state.news.find(a => a.id === id);
  if (!article) return;
  const el = $(`summary-${id}`);
  el.innerHTML = '<span class="news-loading">✦ Summarising…</span>';
  try {
    const summary = await summariseArticle(article.headline, article.description);
    article.aiSummary = summary;
    state.newsExpanded.add(id);
    el.textContent = summary;
  } catch (e) { el.textContent = '⚠ ' + (e.message || e); }
};

// ── Config modal ──────────────────────────────────────────────────────────
window.openConfig = function() {
  $('config-key').value = getKey();
  $('config-modal').classList.add('open');
};
window.closeConfig = function() { $('config-modal').classList.remove('open'); };
window.saveConfig  = function() {
  const key = $('config-key').value.trim();
  if (key) { localStorage.setItem('claude_api_key', key); toast('API key saved. AI features enabled.', 'success'); }
  else      { localStorage.removeItem('claude_api_key'); toast('API key cleared.', 'info'); }
  window.closeConfig();
  renderNews();
};
document.addEventListener('click', e => { if (e.target.id === 'config-modal') window.closeConfig(); });

// ── Refresh ───────────────────────────────────────────────────────────────
window.refresh = async function() {
  toast('Refreshing scores…');
  const [matches, standings, news] = await Promise.all([
    fetchScoreboard(), fetchStandings(), fetchNews(12),
  ]);
  state.matches   = matches;
  state.standings = standings;
  state.news      = news;
  renderScores();
  renderStandings();
  renderNews();
  updateHeroStats();
};

window.refreshNews = function() {
  renderNews();
  fetchNews(12).then(n => { state.news = n; renderNews(); });
};

// ── Hero stats ────────────────────────────────────────────────────────────
function updateHeroStats() {
  const live  = state.matches.filter(m => m.status === 'in').length;
  const today = state.matches.length;
  $('stat-live').textContent  = live;
  $('stat-today').textContent = today;
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function init() {
  window.showSection('scores');

  const [matches, standings, news] = await Promise.all([
    fetchScoreboard(), fetchStandings(), fetchNews(12),
  ]);
  state.matches   = matches;
  state.standings = standings;
  state.news      = news;

  renderScores();
  renderStandings();
  renderNews();
  updateHeroStats();

  // Load full schedule in background — also drives Teams section
  fetchSchedule().then(schedule => {
    state.schedule = schedule;
    renderSchedule();
    renderTeams();
  });

  renderCities();

  // Hide AI hint if key present
  const hint = $('ai-no-key-hint');
  if (hint && getKey()) hint.style.display = 'none';

  // Auto-refresh scores every 60s
  setInterval(async () => {
    state.matches = await fetchScoreboard();
    renderScores();
    updateHeroStats();
  }, 60_000);
}

init();
