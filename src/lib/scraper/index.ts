import * as cheerio from 'cheerio';
import { db, sqlite } from '../db';
import { draftPicks, draftYears } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getConferenceForCollege } from '../scoring/engine';
import { scoreAllEntries } from '../scoring/engine';
import { broadcastEvent } from '@/app/api/sse/draft/clients';

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

async function scrapeESPN(): Promise<ScrapedPick[]> {
  try {
    const res = await fetch('https://www.espn.com/nfl/draft/live', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DraftPropsLive/1.0)' },
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const picks: ScrapedPick[] = [];

    // Try to find JSON data in script tags
    $('script').each((_, el) => {
      const content = $(el).html() || '';
      if (content.includes('__espnfitt__') || content.includes('draftPicks')) {
        try {
          const match = content.match(/window\.__espnfitt__\s*=\s*(\{[\s\S]*?\});/);
          if (match) {
            const data = JSON.parse(match[1]);
            // Navigate to draft picks in the data structure
            if (data?.page?.content?.draftPicks) {
              for (const pick of data.page.content.draftPicks) {
                picks.push({
                  pickNumber: pick.pickNumber || pick.overall,
                  team: pick.team?.displayName || pick.team?.name || '',
                  playerName: pick.player?.displayName || pick.player?.fullName || '',
                  position: pick.player?.position?.abbreviation || '',
                  college: pick.player?.college?.name || '',
                });
              }
            }
          }
        } catch { /* ignore parse errors */ }
      }
    });

    // Fallback: parse HTML structure
    if (picks.length === 0) {
      $('.pick-item, .draft-pick, [class*="PickCard"]').each((_, el) => {
        const $el = $(el);
        const pickNum = parseInt($el.find('[class*="pick-number"], [class*="pickNumber"]').text()) || 0;
        const player = $el.find('[class*="player-name"], [class*="playerName"]').text().trim();
        const team = $el.find('[class*="team-name"], [class*="teamName"]').text().trim();
        const pos = $el.find('[class*="position"]').text().trim();
        const college = $el.find('[class*="college"], [class*="school"]').text().trim();

        if (pickNum && player) {
          picks.push({ pickNumber: pickNum, team, playerName: player, position: pos, college });
        }
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
    const existing = sqlite.prepare(
      'SELECT id FROM draft_picks WHERE year = ? AND pick_number = ?'
    ).get(year, pick.pickNumber);

    if (!existing) {
      const college = normalizeCollege(pick.college);
      const conference = getConferenceForCollege(college);

      db.insert(draftPicks).values({
        id: uuid(),
        year,
        pickNumber: pick.pickNumber,
        team: pick.team,
        playerName: pick.playerName,
        position: normalizePosition(pick.position),
        college,
        conference,
      }).run();

      newPicksCount++;

      // Broadcast the new pick
      broadcastEvent('new_pick', {
        pickNumber: pick.pickNumber,
        team: pick.team,
        playerName: pick.playerName,
        position: normalizePosition(pick.position),
        college,
        conference,
      });
    }
  }

  if (newPicksCount > 0) {
    // Re-score all entries
    scoreAllEntries(year);

    // Broadcast score update
    const { getLeaderboard } = await import('../scoring/engine');
    broadcastEvent('score_update', { leaderboard: getLeaderboard(year) });
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
