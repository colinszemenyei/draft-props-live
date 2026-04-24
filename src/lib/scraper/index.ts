import * as cheerio from 'cheerio';
import { db, client } from '../db';
import { draftPicks, draftYears } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getConferenceForCollege } from '../scoring/engine';
import { scoreAllEntries } from '../scoring/engine';
import { broadcastEvent } from '@/app/api/sse/draft/clients';
import { DRAFT_ORDER_2026 } from '../draft-order';

// Build original team lookup for trade detection
const originalTeamForPick = new Map<number, string>();
for (const slot of DRAFT_ORDER_2026) {
  originalTeamForPick.set(slot.pick, slot.team);
}

function isTradeDetected(pickNumber: number, actualTeam: string): boolean {
  const originalTeam = originalTeamForPick.get(pickNumber);
  if (!originalTeam || !actualTeam) return false;
  // Normalize and compare — if the team making the pick differs from the original, it's a trade
  const normalize = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
  return normalize(originalTeam) !== normalize(actualTeam);
}

const POSITION_MAP: Record<string, string> = {
  'QB': 'QB', 'RB': 'RB', 'WR': 'WR', 'TE': 'TE',
  'OT': 'OT', 'T': 'OT', 'OL': 'OT', 'G': 'IOL', 'C': 'IOL', 'IOL': 'IOL',
  'EDGE': 'EDGE', 'DE': 'EDGE', 'OLB': 'EDGE',
  'DT': 'DT', 'NT': 'DT', 'DL': 'DT',
  'LB': 'LB', 'ILB': 'LB', 'MLB': 'LB',
  'CB': 'CB', 'S': 'S', 'FS': 'S', 'SS': 'S', 'DB': 'CB',
};

function normalizePosition(pos: string): string {
  return POSITION_MAP[pos.toUpperCase()] || pos.toUpperCase();
}

function normalizeCollege(name: string): string {
  const aliases: Record<string, string> = {
    'ohio st.': 'Ohio State', 'ohio st': 'Ohio State',
    'penn st.': 'Penn State', 'penn st': 'Penn State',
    'michigan st.': 'Michigan State', 'michigan st': 'Michigan State',
    'oklahoma st.': 'Oklahoma State', 'oklahoma st': 'Oklahoma State',
    'miss. state': 'Mississippi State', 'mississippi st.': 'Mississippi State',
    'fla.': 'Florida', 'fla': 'Florida',
    'ala.': 'Alabama', 'ala': 'Alabama',
    'ga.': 'Georgia', 'ga': 'Georgia',
    'tenn.': 'Tennessee', 'tenn': 'Tennessee',
    'usc': 'USC', 'lsu': 'LSU', 'ucf': 'UCF',
    'ole miss': 'Ole Miss', 'miami (fl)': 'Miami', 'miami (fla.)': 'Miami',
    'texas a&m': 'Texas A&M',
    'n.c. state': 'NC State', 'nc state': 'NC State',
    'north carolina st.': 'NC State',
  };
  const lower = name.trim().toLowerCase();
  return aliases[lower] || name.trim();
}

interface ScrapedPick {
  pickNumber: number;
  team: string;
  playerName: string;
  position: string;
  college: string;
}

// ESPN's public JSON API for draft data. Much more reliable than HTML
// scraping — no layout changes to chase — and returns structured fields
// including position ids, team mapping, and a per-pick `status`.
async function scrapeESPN(): Promise<ScrapedPick[]> {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DraftPropsLive/1.0)' },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      positions?: Array<{ id: string; abbreviation: string }>;
      teams?: Array<{ id: string; displayName: string; shortDisplayName: string }>;
      picks?: Array<{
        status: string;
        pick: number;
        overall: number;
        round: number;
        traded: boolean;
        athlete?: {
          displayName?: string;
          position?: { id?: string };
          team?: { shortDisplayName?: string; location?: string };
        };
        teamId?: string | number;
      }>;
    };

    const posMap = new Map<string, string>();
    for (const p of data.positions || []) posMap.set(String(p.id), p.abbreviation);

    const teamMap = new Map<string, string>();
    for (const t of data.teams || []) teamMap.set(String(t.id), t.displayName);

    const picks: ScrapedPick[] = [];
    for (const p of data.picks || []) {
      if (p.round !== 1) continue;              // Round 1 only
      if (p.status !== 'SELECTION_MADE') continue; // Skip on-clock / upcoming
      if (!p.athlete?.displayName) continue;

      picks.push({
        pickNumber: p.overall,
        team: teamMap.get(String(p.teamId)) || '',
        playerName: p.athlete.displayName,
        position: posMap.get(String(p.athlete.position?.id || '')) || '',
        college:
          p.athlete.team?.shortDisplayName ||
          p.athlete.team?.location ||
          '',
      });
    }

    return picks;
  } catch (error) {
    console.error('ESPN scrape failed:', error);
    return [];
  }
}

async function scrapeNFL(): Promise<ScrapedPick[]> {
  try {
    const res = await fetch('https://www.nfl.com/draft/tracker/picks/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DraftPropsLive/1.0)' },
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const picks: ScrapedPick[] = [];

    // Try __NEXT_DATA__ JSON
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (nextDataScript) {
      try {
        const data = JSON.parse(nextDataScript);
        const draftData = data?.props?.pageProps?.draftPicks || data?.props?.pageProps?.picks || [];
        for (const pick of draftData) {
          picks.push({
            pickNumber: pick.pickNumber || pick.overall || pick.number,
            team: pick.team?.fullName || pick.team?.name || pick.teamName || '',
            playerName: pick.prospect?.name || pick.player?.name || pick.playerName || '',
            position: pick.prospect?.position || pick.player?.position || pick.position || '',
            college: pick.prospect?.college || pick.player?.college || pick.college || '',
          });
        }
      } catch { /* ignore */ }
    }

    // Fallback HTML parsing
    if (picks.length === 0) {
      $('[class*="pick-card"], [class*="draft-pick"]').each((_, el) => {
        const $el = $(el);
        const pickNum = parseInt($el.find('[class*="pick-number"]').text()) || 0;
        const player = $el.find('[class*="player-name"]').text().trim();
        const team = $el.find('[class*="team-name"]').text().trim();
        const pos = $el.find('[class*="position"]').text().trim();
        const college = $el.find('[class*="college"]').text().trim();

        if (pickNum && player) {
          picks.push({ pickNumber: pickNum, team, playerName: player, position: pos, college });
        }
      });
    }

    return picks;
  } catch (error) {
    console.error('NFL.com scrape failed:', error);
    return [];
  }
}

let failureCount = 0;
let pollingInterval: NodeJS.Timeout | null = null;

export async function pollDraftPicks(year: number) {
  // Try ESPN first, then NFL.com
  let picks = await scrapeESPN();
  if (picks.length === 0) {
    picks = await scrapeNFL();
  }

  if (picks.length === 0) {
    failureCount++;
    console.warn(`Scraper failure #${failureCount}`);
    return { success: false, failureCount };
  }

  failureCount = 0;
  let newPicksCount = 0;

  for (const pick of picks) {
    if (!pick.playerName || !pick.pickNumber) continue;

    // Check if we already have this pick
    const existing = (await client.execute({
      sql: 'SELECT id FROM draft_picks WHERE year = ? AND pick_number = ?',
      args: [year, pick.pickNumber],
    })).rows[0];

    if (!existing) {
      const college = normalizeCollege(pick.college);
      const conference = getConferenceForCollege(college);
      const trade = isTradeDetected(pick.pickNumber, pick.team);
      const origTeam = originalTeamForPick.get(pick.pickNumber) || '';

      try {
        await db.insert(draftPicks).values({
          id: uuid(),
          year,
          pickNumber: pick.pickNumber,
          team: pick.team,
          playerName: pick.playerName,
          position: normalizePosition(pick.position),
          college,
          conference,
          isTrade: trade,
          originalTeam: origTeam,
        }).run();
        newPicksCount++;
      } catch (err) {
        console.error(`Insert failed for pick ${pick.pickNumber}:`, err);
        continue; // don't let one failure block the rest
      }

      // Broadcast — best-effort so a broadcast error doesn't stop the loop
      try {
        broadcastEvent('new_pick', {
          pickNumber: pick.pickNumber,
          team: pick.team,
          playerName: pick.playerName,
          position: normalizePosition(pick.position),
          college,
          conference,
          isTrade: trade,
        });
      } catch (err) {
        console.error('broadcast new_pick failed:', err);
      }
    }
  }

  // Score + leaderboard broadcast are best-effort. If these throw, the
  // picks are still safely in the DB from above.
  if (newPicksCount > 0) {
    try {
      await scoreAllEntries(year);
      const { getLeaderboard } = await import('../scoring/engine');
      broadcastEvent('score_update', { leaderboard: await getLeaderboard(year) });
    } catch (err) {
      console.error('scoring/leaderboard broadcast failed:', err);
    }
  }

  return { success: true, newPicks: newPicksCount, totalPicks: picks.length };
}

export function startPolling(year: number) {
  if (pollingInterval) return;
  console.log(`Starting draft scraper polling for ${year}`);
  pollingInterval = setInterval(() => pollDraftPicks(year), 30000);
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('Stopped draft scraper polling');
  }
}

export function getScraperStatus() {
  return {
    isPolling: !!pollingInterval,
    failureCount,
  };
}

// Auto-resume polling if the draft is live (handles server restarts on free tier)
let pollingCheckDone = false;
export function ensurePollingIfLive(year: number) {
  if (pollingInterval || pollingCheckDone) return;
  pollingCheckDone = true;

  // Check draft status asynchronously and start polling if live
  (async () => {
    try {
      const result = await client.execute({
        sql: 'SELECT status FROM draft_years WHERE year = ?',
        args: [year],
      });
      const row = result.rows[0];
      if (row && row.status === 'live') {
        console.log(`Draft is live — auto-resuming polling for ${year}`);
        startPolling(year);
      }
    } catch {
      // DB not ready yet, will retry on next SSE connection
      pollingCheckDone = false;
    }
  })();
}
