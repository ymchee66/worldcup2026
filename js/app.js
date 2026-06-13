import { fetchScoreboard, fetchStandings, fetchNews, fetchSchedule } from './api.js';
import { streamMatchAnalysis, streamDailyDigest, summariseArticle } from './ai.js';

// ── State ─────────────────────────────────────────────────────────────────
let state = {
  matches: [],
  standings: [],
  news: [],
  schedule: [],
  activeSection: 'scores',
  selectedMatch: null,
  newsExpanded: new Set(),
};

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

// ── Render: Scoreboard ────────────────────────────────────────────────────
function renderScores() {
  const el = $('scores-container');
  if (!state.matches.length) {
    el.innerHTML = `<div class="bracket-placeholder">
      <span style="font-size:2.5rem">⚽</span>
      <span>No matches scheduled today — check the Schedule tab.</span>
    </div>`;
    return;
  }

  el.innerHTML = state.matches.map(m => {
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
  }).join('');

  // live count badge
  const live = state.matches.filter(m => m.status === 'in').length;
  const badge = $('live-count');
  if (badge) badge.textContent = live ? `${live} LIVE` : '';
}

// ── Render: Standings ─────────────────────────────────────────────────────
function renderStandings() {
  const el = $('standings-container');
  if (!state.standings.length) {
    el.innerHTML = `<div class="bracket-placeholder"><span>Loading standings…</span></div>`;
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
    el.innerHTML = `<div class="bracket-placeholder"><span>Loading news…</span></div>`;
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

  // Group by date
  const byDate = {};
  for (const m of state.schedule) {
    const d = matchLocalDate(m.date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(m);
  }

  el.innerHTML = Object.entries(byDate).map(([date, ms]) => {
    const matchDate = new Date(ms[0].date);
    matchDate.setHours(0, 0, 0, 0);
    const isPast   = matchDate < today;
    const isToday  = matchDate.getTime() === today.getTime();
    const dayLabel = isToday ? '📍 Today' : date;

    return `
    <div style="margin-bottom:1.75rem">
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
                  ? `<div class="score-main">${m.away.score} <span class="score-sep">–</span> ${m.home.score}</div>`
                  : `<div class="score-main" style="font-size:1.1rem;color:var(--text-dim)">vs</div>`
                }
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

// ── Nav sections ──────────────────────────────────────────────────────────
function showSection(name) {
  state.activeSection = name;
  document.querySelectorAll('.main-section').forEach(s => {
    s.style.display = s.id === `section-${name}` ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.section === name);
  });
  updateBottomNav(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.showSection = showSection;

window.updateBottomNav = function(name) {
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `bnav-${name}`);
  });
};

// ── Match detail / AI commentary ──────────────────────────────────────────
window.selectMatch = function(id) {
  const m = state.matches.find(x => x.id === id);
  if (!m) return;
  state.selectedMatch = m;

  $('commentary-match').textContent = `${m.away.flag} ${m.away.name}  ${m.away.score} – ${m.home.score}  ${m.home.flag} ${m.home.name}`;
  $('commentary-body').textContent = 'Click "Generate Analysis" to get AI match commentary.';

  document.querySelector('.commentary-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.generateAnalysis = async function() {
  if (!state.selectedMatch) {
    toast('Select a match first by clicking on a match card.', 'error');
    return;
  }
  const btn = $('btn-analysis');
  btn.disabled = true;
  btn.textContent = '✦ Generating…';

  await streamMatchAnalysis(state.selectedMatch, $('commentary-body'));

  btn.disabled = false;
  btn.textContent = '✦ Generate Analysis';
};

window.generateDigest = async function() {
  const btn = $('btn-digest');
  btn.disabled = true;
  btn.textContent = '✦ Writing digest…';

  await streamDailyDigest(state.matches, $('digest-body'));

  btn.disabled = false;
  btn.textContent = '✦ Daily Digest';
};

// ── AI news summary ───────────────────────────────────────────────────────
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
  } catch (e) {
    el.textContent = '⚠ ' + (e.message || e);
  }
};

// ── Config modal ──────────────────────────────────────────────────────────
function getKey() { return localStorage.getItem('claude_api_key') || ''; }

window.openConfig = function() {
  $('config-key').value = getKey();
  $('config-modal').classList.add('open');
};

window.closeConfig = function() {
  $('config-modal').classList.remove('open');
};

window.saveConfig = function() {
  const key = $('config-key').value.trim();
  if (key) {
    localStorage.setItem('claude_api_key', key);
    toast('API key saved. AI features enabled.', 'success');
  } else {
    localStorage.removeItem('claude_api_key');
    toast('API key cleared.', 'info');
  }
  closeConfig();
  renderNews(); // refresh AI button state
};

// close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.id === 'config-modal') closeConfig();
});

// ── Data refresh ──────────────────────────────────────────────────────────
async function refresh() {
  const [matches, standings, news] = await Promise.all([
    fetchScoreboard(),
    fetchStandings(),
    fetchNews(12),
  ]);
  state.matches   = matches;
  state.standings = standings;
  state.news      = news;

  renderScores();
  renderStandings();
  renderNews();
  updateHeroStats();
}

async function loadSchedule() {
  state.schedule = await fetchSchedule();
  renderSchedule();
}

function updateHeroStats() {
  const live  = state.matches.filter(m => m.status === 'in').length;
  const today = state.matches.length;
  $('stat-live').textContent  = live;
  $('stat-today').textContent = today;
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function init() {
  showSection('scores');
  await refresh();
  loadSchedule();

  // refresh scores every 60s
  setInterval(async () => {
    state.matches = await fetchScoreboard();
    renderScores();
    updateHeroStats();
  }, 60_000);
}

init();
