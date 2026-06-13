// ESPN public endpoints — no key required
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const WC_SLUG   = 'fifa.world';

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
};

function teamFlag(abbr, displayName) {
  const iso = TEAM_ISO[abbr?.toUpperCase()];
  if (iso && iso.length === 2) return FLAG(iso);
  // Fallback: try first two letters of abbr
  if (abbr && abbr.length >= 2) return FLAG(abbr.slice(0,2));
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
    const events = d.events || [];
    return events.map(ev => {
      const comp = ev.competitions?.[0] || {};
      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
      const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
      const status = comp.status?.type || {};
      return {
        id: ev.id,
        name: ev.name,
        date: ev.date,
        status: status.state,        // 'pre' | 'in' | 'post'
        statusText: status.shortDetail || status.description,
        clock: comp.status?.displayClock || '',
        period: comp.status?.period || '',
        home: {
          abbr: home.team?.abbreviation || '',
          name: home.team?.shortDisplayName || home.team?.displayName || '',
          score: home.score || '–',
          flag: teamFlag(home.team?.abbreviation, home.team?.displayName),
        },
        away: {
          abbr: away.team?.abbreviation || '',
          name: away.team?.shortDisplayName || away.team?.displayName || '',
          score: away.score || '–',
          flag: teamFlag(away.team?.abbreviation, away.team?.displayName),
        },
        venue: comp.venue?.fullName || '',
        broadcast: comp.broadcasts?.[0]?.names?.[0] || '',
      };
    });
  } catch (e) {
    console.warn('Scoreboard fetch failed:', e);
    return [];
  }
}

// ── Standings ─────────────────────────────────────────────────────────────
export async function fetchStandings() {
  try {
    const d = await fetchJSON(`${ESPN_BASE}/${WC_SLUG}/standings`);
    const groups = [];
    for (const child of (d.children || [])) {
      const groupName = child.name || child.abbreviation || '';
      const entries = (child.standings?.entries || []).map((e, idx) => {
        const team = e.team || {};
        const stats = {};
        for (const s of (e.stats || [])) stats[s.abbreviation || s.name] = s.value;
        return {
          pos: idx + 1,
          abbr: team.abbreviation || '',
          name: team.shortDisplayName || team.displayName || '',
          flag: teamFlag(team.abbreviation, team.displayName),
          gp:  stats['GP']  ?? stats['gp']  ?? 0,
          w:   stats['W']   ?? stats['w']   ?? 0,
          d:   stats['D']   ?? stats['d']   ?? 0,
          l:   stats['L']   ?? stats['l']   ?? 0,
          gf:  stats['GF']  ?? stats['gf']  ?? 0,
          ga:  stats['GA']  ?? stats['ga']  ?? 0,
          gd:  stats['GD']  ?? stats['gd']  ?? 0,
          pts: stats['PTS'] ?? stats['pts'] ?? 0,
        };
      });
      if (entries.length) groups.push({ name: groupName, entries });
    }
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
      id: a.dataSourceIdentifier || a.id,
      headline: a.headline || '',
      description: a.description || '',
      published: a.published || '',
      categories: (a.categories || []).map(c => c.description || c.type || '').filter(Boolean),
      image: a.images?.[0]?.url || '',
      links: a.links?.web?.href || a.links?.api?.href || '',
    }));
  } catch (e) {
    console.warn('News fetch failed:', e);
    return [];
  }
}

// ── Schedule (upcoming) ───────────────────────────────────────────────────
export async function fetchSchedule(daysAhead = 7) {
  const results = [];
  const today = new Date();
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyymmdd = d.toISOString().slice(0,10).replace(/-/g,'');
    try {
      const data = await fetchJSON(`${ESPN_BASE}/${WC_SLUG}/scoreboard?dates=${yyyymmdd}`);
      for (const ev of (data.events || [])) {
        const comp = ev.competitions?.[0] || {};
        const competitors = comp.competitors || [];
        const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
        const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
        results.push({
          id: ev.id,
          date: ev.date,
          home: {
            abbr: home.team?.abbreviation || '',
            name: home.team?.shortDisplayName || '',
            flag: teamFlag(home.team?.abbreviation, home.team?.displayName),
          },
          away: {
            abbr: away.team?.abbreviation || '',
            name: away.team?.shortDisplayName || '',
            flag: teamFlag(away.team?.abbreviation, away.team?.displayName),
          },
          venue: comp.venue?.fullName || '',
          round: ev.season?.slug || '',
        });
      }
    } catch {}
  }
  return results;
}
