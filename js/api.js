// ESPN public endpoints — no key required
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const WC_SLUG   = 'fifa.world';

// Slugs → human-readable round labels
const ROUND_LABELS = {
  'group-stage':         'Group Stage',
  'round-of-32':         'Round of 32',
  'round-of-16':         'Round of 16',
  'quarterfinal':        'Quarterfinal',
  'quarterfinals':       'Quarterfinal',
  'semifinal':           'Semifinal',
  'semifinals':          'Semifinal',
  'third-place-playoff': '3rd Place',
  'final':               'Final',
  'friendly':            'Friendly',
  'qualifying':          'Qualifying',
  'qualification':       'Qualifying',
};

function roundLabel(slug) {
  if (!slug) return '';
  return ROUND_LABELS[slug.toLowerCase()] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Country → flag emoji lookup (ISO 3166-1 alpha-2)
const FLAG = (code) => {
  if (!code) return '🏳';
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
};

// Map ESPN team abbreviation/name to ISO code best-effort
const TEAM_ISO = {
  USA:'US', MEX:'MX', CAN:'CA', BRA:'BR', ARG:'AR', FRA:'FR', ENG:'GB-ENG',
  ESP:'ES', GER:'DE', ITA:'IT', POR:'PT', NED:'NL', BEL:'BE', CRO:'HR',
  MAR:'MA', SEN:'SN', GHA:'GH', NGA:'NG', CMR:'CM', EGY:'EG', TUN:'TN',
  JPN:'JP', KOR:'KR', AUS:'AU', IRN:'IR', SAU:'SA', QAT:'QA', URU:'UY',
  COL:'CO', CHI:'CL', PER:'PE', ECU:'EC', PAR:'PY', BOL:'BO', VEN:'VE',
  HON:'HN', CRC:'CR', PAN:'PA', JAM:'JM', TRI:'TT', SLV:'SV', GTM:'GT',
  NZL:'NZ', FIJ:'FJ', ALG:'DZ', CIV:'CI', MLI:'ML', BFA:'BF', GAB:'GA',
  SWI:'CH', AUT:'AT', SWE:'SE', NOR:'NO', DEN:'DK', POL:'PL', UKR:'UA',
  SRB:'RS', SCO:'GB-SCO', WAL:'GB-WLS', IRL:'IE', SVK:'SK', HUN:'HU',
  CZE:'CZ', GRE:'GR', TUR:'TR', ROU:'RO', ALB:'AL', SLO:'SI', GEO:'GE',
  RSA:'ZA', ZIM:'ZW', ANG:'AO', MOZ:'MZ', TAN:'TZ', KEN:'KE', ETH:'ET',
  IDN:'ID', THA:'TH', VIE:'VN', MYS:'MY', PHI:'PH', IND:'IN', PAK:'PK',
  ISR:'IL', LBN:'LB', JOR:'JO', IRQ:'IQ', OMA:'OM', UAE:'AE', KWT:'KW',
  UZB:'UZ', KAZ:'KZ', ARM:'AM', AZE:'AZ',
};

// Regional flags not coverable by 2-letter ISO code (tag-based emoji)
const SPECIAL_FLAGS = {
  'GB-ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'GB-SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'GB-WLS': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
};

function teamFlag(abbr, displayName) {
  const iso = TEAM_ISO[abbr?.toUpperCase()];
  if (iso) {
    if (SPECIAL_FLAGS[iso]) return SPECIAL_FLAGS[iso];
    if (iso.length === 2) return FLAG(iso);
  }
  // Name-based fallback for British nations
  const name = (displayName || '').toLowerCase();
  if (name.includes('england')) return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
  if (name.includes('scotland')) return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  if (name.includes('wales')) return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
  // Attempt: 3-letter FIFA abbr → regional flag (e.g. BRA→BR, USA→US, MEX→MX)
  if (abbr && abbr.length >= 2) {
    const guess = abbr.slice(0, 2).toUpperCase();
    return FLAG(guess);
  }
  return '⚽';
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── Scoreboard (today's matches) ──────────────────────────────────────────
export async function fetchScoreboard() {
  try {
    const d = await fetchJSON(`${ESPN_BASE}/${WC_SLUG}/scoreboard`);
    return (d.events || []).map(ev => parseEvent(ev));
  } catch (e) {
    console.warn('Scoreboard fetch failed:', e);
    return [];
  }
}

function parseEvent(ev) {
  const comp = ev.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
  const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
  const status = comp.status?.type || {};
  return {
    id: ev.id,
    name: ev.name,
    date: ev.date,
    status: status.state,
    statusText: status.shortDetail || status.description,
    clock: comp.status?.displayClock || '',
    period: comp.status?.period || '',
    home: {
      id:    home.team?.id || '',
      abbr:  home.team?.abbreviation || '',
      name:  home.team?.shortDisplayName || home.team?.displayName || '',
      score: home.score ?? null,
      flag:  teamFlag(home.team?.abbreviation, home.team?.displayName),
    },
    away: {
      id:    away.team?.id || '',
      abbr:  away.team?.abbreviation || '',
      name:  away.team?.shortDisplayName || away.team?.displayName || '',
      score: away.score ?? null,
      flag:  teamFlag(away.team?.abbreviation, away.team?.displayName),
    },
    venue:     comp.venue?.fullName || '',
    broadcast: comp.broadcasts?.[0]?.names?.[0] || '',
    round:     roundLabel(ev.season?.slug),
    group:     comp.notes?.[0]?.headline || '',
  };
}

// ── Match summary (stats, odds, broadcasts, form, videos) ─────────────────
export async function fetchMatchSummary(eventId) {
  try {
    const d = await fetchJSON(`${ESPN_BASE}/${WC_SLUG}/summary?event=${eventId}`);

    // Team stats (possession, shots, corners, fouls, cards)
    const teamStats = {};
    for (const team of d.boxscore?.teams || []) {
      const ha = team.homeAway;
      teamStats[ha] = { name: team.team?.displayName || '', abbr: team.team?.abbreviation || '', stats: {} };
      for (const s of team.statistics || []) teamStats[ha].stats[s.name] = s.displayValue;
    }

    // Broadcasts
    const broadcasts = (d.broadcasts || [])
      .map(b => ({ name: b.media?.shortName || b.media?.callLetters || b.media?.displayName || '', region: b.region || 'us' }))
      .filter(b => b.name);

    // Odds → implied win/draw/loss probabilities
    let odds = null;
    const pc = d.pickcenter?.[0];
    if (pc) {
      const toProb = ml => ml == null ? 0 : ml > 0 ? 100 / (ml + 100) : Math.abs(ml) / (Math.abs(ml) + 100);
      const pH = toProb(pc.homeTeamOdds?.moneyLine);
      const pD = toProb(pc.drawOdds?.moneyLine);
      const pA = toProb(pc.awayTeamOdds?.moneyLine);
      const tot = pH + pD + pA || 1;
      odds = {
        homeWin: Math.round((pH / tot) * 100),
        draw:    Math.round((pD / tot) * 100),
        awayWin: Math.round((pA / tot) * 100),
        homeML:  pc.homeTeamOdds?.moneyLine,
        awayML:  pc.awayTeamOdds?.moneyLine,
        drawML:  pc.drawOdds?.moneyLine,
        overUnder: pc.overUnder,
      };
    }

    // Videos
    const videos = (d.videos || [])
      .map(v => ({ headline: v.headline || '', url: v.links?.web?.href || '' }))
      .filter(v => v.url);

    // Last 5 form per team (ESPN keys by team object, not homeAway string)
    // Match the team IDs from the header to determine home/away
    const headerComps = d.header?.competitions?.[0]?.competitors || [];
    const homeId = headerComps.find(c => c.homeAway === 'home')?.team?.id;
    const awayId = headerComps.find(c => c.homeAway === 'away')?.team?.id;
    const lastFive = {};
    for (const [i, team] of (d.lastFiveGames || []).entries()) {
      const tid = team.team?.id || String(i);
      const ha = tid === homeId ? 'home' : tid === awayId ? 'away' : (i === 0 ? 'home' : 'away');
      lastFive[ha] = (team.events || []).map(e => ({
        result:      e.gameResult || '',
        opponent:    e.opponent?.displayName || '',
        score:       e.score || '',
        competition: e.competitionName || '',
        date:        e.gameDate || '',
        atVs:        e.atVs || 'vs',
      }));
    }

    // H2H (exclude current match)
    const h2hSeen = new Set();
    const h2h = [];
    for (const team of d.headToHeadGames || []) {
      for (const e of team.events || []) {
        if (e.id === String(eventId) || h2hSeen.has(e.id)) continue;
        h2hSeen.add(e.id);
        h2h.push({ date: e.gameDate, score: e.score, result: e.gameResult, competition: e.competitionName, opponent: e.opponent?.displayName });
      }
    }

    // Key events: goals, cards, substitutions
    const headerCompsForEvents = d.header?.competitions?.[0]?.competitors || [];
    const homeIdE = headerCompsForEvents.find(c => c.homeAway === 'home')?.team?.id;
    const keyEvents = (d.keyEvents || []).map(ev => {
      const type = (ev.type?.text || '').toLowerCase();
      let kind = null;
      if (type.includes('goal')) kind = 'goal';
      else if (type.includes('yellow')) kind = 'yellow';
      else if (type.includes('red')) kind = 'red';
      else if (type.includes('sub')) kind = 'sub';
      if (!kind) return null;
      const teamId = ev.team?.id || '';
      const ha = teamId ? (teamId === homeIdE ? 'home' : 'away') : null;
      const athlete = ev.participants?.[0]?.athlete?.displayName || ev.athleteName || '';
      const minute = ev.clock?.displayValue || ev.period?.displayValue || '';
      return { kind, ha, minute, athlete, text: ev.text || ev.shortText || '' };
    }).filter(Boolean);

    // Game info: attendance, venue
    const gi = d.gameInfo || {};
    const gameInfo = {
      attendance: gi.attendance || null,
      venue:      gi.venue?.fullName || '',
      city:       gi.venue?.address?.city || '',
    };

    // Article / match report
    const article = d.article ? { headline: d.article.headline || '', body: d.article.story || d.article.description || '' } : null;

    return { teamStats, broadcasts, odds, videos, lastFive, h2h: h2h.slice(0, 5), keyEvents, gameInfo, article };
  } catch (e) {
    console.warn('Match summary fetch failed:', e);
    return null;
  }
}

// ── Team roster ───────────────────────────────────────────────────────────
export async function fetchTeamRoster(teamId) {
  try {
    const d = await fetchJSON(`${ESPN_BASE}/${WC_SLUG}/teams/${teamId}/roster`);
    return (d.athletes || []).map(a => ({
      id:       a.id || '',
      name:     a.displayName || a.shortName || '',
      number:   a.jersey || '',
      position: a.position?.name || '',
      posAbbr:  a.position?.abbreviation || '',
      age:      a.age || null,
      birthDate:a.birthDate || '',
      club:     a.clubs?.[0]?.displayName || '',
      nationality: a.citizenship || '',
      height:   a.displayHeight || '',
      weight:   a.displayWeight || '',
      caps:     a.experience?.years || null,
    }));
  } catch (e) {
    console.warn('Roster fetch failed:', e);
    return [];
  }
}

// ── All teams (for ID mapping) ────────────────────────────────────────────
export async function fetchAllTeams() {
  try {
    const d = await fetchJSON(`${ESPN_BASE}/${WC_SLUG}/teams?limit=100`);
    const out = {};
    for (const t of d.sports?.[0]?.leagues?.[0]?.teams || []) {
      const team = t.team;
      if (team?.abbreviation) out[team.abbreviation.toUpperCase()] = team.id;
    }
    return out;
  } catch (e) {
    console.warn('Teams fetch failed:', e);
    return {};
  }
}

// ── Standings (correct v2 endpoint) ──────────────────────────────────────
export async function fetchStandings() {
  try {
    const d = await fetchJSON('https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings');
    const groups = [];
    for (const child of d.children || []) {
      const groupName = child.name || child.abbreviation || '';
      const entries = (child.standings?.entries || []).map((e, idx) => {
        const team = e.team || {};
        const stats = {};
        for (const s of e.stats || []) stats[s.name] = s.value;
        return {
          pos:  stats['rank'] ?? idx + 1,
          id:   team.id || '',
          abbr: team.abbreviation || '',
          name: team.shortDisplayName || team.displayName || '',
          flag: teamFlag(team.abbreviation, team.displayName),
          gp:   stats['gamesPlayed']       ?? 0,
          w:    stats['wins']              ?? 0,
          d:    stats['ties']              ?? 0,
          l:    stats['losses']            ?? 0,
          gf:   stats['pointsFor']         ?? 0,
          ga:   stats['pointsAgainst']     ?? 0,
          gd:   stats['pointDifferential'] ?? 0,
          pts:  stats['points']            ?? 0,
        };
      });
      entries.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      entries.forEach((e, i) => e.pos = i + 1);
      if (entries.length) groups.push({ name: groupName, entries });
    }
    groups.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  } catch (e) {
    console.warn('Standings fetch failed:', e);
    return [];
  }
}

// ── News ──────────────────────────────────────────────────────────────────
export async function fetchNews(limit = 12) {
  try {
    const d = await fetchJSON(`${ESPN_BASE}/${WC_SLUG}/news?limit=${limit}`);
    return (d.articles || []).map(a => ({
      id:          a.dataSourceIdentifier || a.id,
      headline:    a.headline || '',
      description: a.description || '',
      published:   a.published || '',
      categories:  (a.categories || []).map(c => c.description || c.type || '').filter(Boolean),
      image:       a.images?.[0]?.url || '',
      links:       a.links?.web?.href || a.links?.api?.href || '',
    }));
  } catch (e) {
    console.warn('News fetch failed:', e);
    return [];
  }
}

// ── Schedule (full tournament, parallel fetch) ────────────────────────────
export async function fetchSchedule() {
  const start = new Date('2026-06-11');
  const end   = new Date('2026-07-19');
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  const responses = await Promise.allSettled(
    dates.map(yyyymmdd => fetchJSON(`${ESPN_BASE}/${WC_SLUG}/scoreboard?dates=${yyyymmdd}`))
  );
  const results = [];
  for (const r of responses) {
    if (r.status !== 'fulfilled') continue;
    for (const ev of r.value.events || []) results.push(parseEvent(ev));
  }
  results.sort((a, b) => new Date(a.date) - new Date(b.date));
  return results;
}
