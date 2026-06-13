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
        round: roundLabel(ev.season?.slug),
        group: comp.notes?.[0]?.headline || '',   // e.g. "Group A"
      };
    });
  } catch (e) {
    console.warn('Scoreboard fetch failed:', e);
    return [];
  }
}

// ── Standings (correct v2 endpoint) ──────────────────────────────────────
export async function fetchStandings() {
  try {
    const d = await fetchJSON('https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings');
    const groups = [];
    for (const child of (d.children || [])) {
      const groupName = child.name || child.abbreviation || '';
      const entries = (child.standings?.entries || []).map((e, idx) => {
        const team = e.team || {};
        const stats = {};
        for (const s of (e.stats || [])) stats[s.name] = s.value;
        return {
          pos:  (stats['rank'] ?? idx + 1),
          abbr: team.abbreviation || '',
          name: team.shortDisplayName || team.displayName || '',
          flag: teamFlag(team.abbreviation, team.displayName),
          logo: team.logos?.[0]?.href || '',
          gp:   stats['gamesPlayed']      ?? 0,
          w:    stats['wins']             ?? 0,
          d:    stats['ties']             ?? 0,
          l:    stats['losses']           ?? 0,
          gf:   stats['pointsFor']        ?? 0,
          ga:   stats['pointsAgainst']    ?? 0,
          gd:   stats['pointDifferential'] ?? 0,
          pts:  stats['points']           ?? 0,
          advanced: stats['advanced']     ?? 0,
        };
      });
      // Sort by points desc, then GD desc
      entries.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
      entries.forEach((e, i) => e.pos = i + 1);
      if (entries.length) groups.push({ name: groupName, entries });
    }
    // Sort groups alphabetically
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

// ── Schedule (full tournament, parallel fetch) ────────────────────────────
// World Cup 2026: Jun 11 – Jul 19. We fetch every date in the window in
// parallel so the tab loads in one round-trip instead of 39 sequential ones.
export async function fetchSchedule() {
  const start = new Date('2026-06-11');
  const end   = new Date('2026-07-19');

  // Build list of yyyymmdd strings for the full tournament window
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const responses = await Promise.allSettled(
    dates.map(yyyymmdd =>
      fetchJSON(`${ESPN_BASE}/${WC_SLUG}/scoreboard?dates=${yyyymmdd}`)
    )
  );

  const results = [];
  for (const r of responses) {
    if (r.status !== 'fulfilled') continue;
    for (const ev of (r.value.events || [])) {
      const comp = ev.competitions?.[0] || {};
      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
      const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
      const status = comp.status?.type || {};
      results.push({
        id:     ev.id,
        date:   ev.date,
        status: status.state,
        statusText: status.shortDetail || '',
        home: {
          abbr:  home.team?.abbreviation || '',
          name:  home.team?.shortDisplayName || '',
          flag:  teamFlag(home.team?.abbreviation, home.team?.displayName),
          score: home.score ?? null,
        },
        away: {
          abbr:  away.team?.abbreviation || '',
          name:  away.team?.shortDisplayName || '',
          flag:  teamFlag(away.team?.abbreviation, away.team?.displayName),
          score: away.score ?? null,
        },
        venue: comp.venue?.fullName || '',
        round: roundLabel(ev.season?.slug),
        group: comp.notes?.[0]?.headline || '',
      });
    }
  }

  // Sort chronologically (responses arrive out of order from Promise.allSettled)
  results.sort((a, b) => new Date(a.date) - new Date(b.date));
  return results;
}
