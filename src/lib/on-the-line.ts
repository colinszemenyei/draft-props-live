// Figures out which prop questions are "on the line" for the next draft
// pick — i.e. could be decided or meaningfully affected by the upcoming
// selection. For each one, buckets entries by their answer so the UI
// can show who's cheering for what.

import { countDistinctTrades } from './trade-utils';

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
  points: number;
  category: string | null;
  scoringRule: Record<string, unknown> | null;
}

interface Entry {
  id: string;
  displayName: string; // already includes entry-name suffix if user has multiple
  picks: Record<string, unknown>;
  submittedAt?: string | null;
}

interface DraftPickLite {
  pickNumber: number;
  playerName: string;
  position: string;
  college: string;
  conference: string;
  team?: string;
  isTrade?: boolean;
  originalTeam?: string | null;
}

export interface OnTheLineItem {
  questionId: string;
  questionText: string;
  points: number;
  /**
   * Picks-until-potentially-resolved. Lower = more imminent.
   *   0   → could resolve on the very next pick
   *   N   → N picks from now
   *   99  → ongoing / no clear resolution moment
   */
  imminence: number;
  /** Short tag, e.g. "This pick", "Next few picks", "Ongoing" */
  urgency: string;
  /** Short reason explaining why it's live right now. */
  explainer: string;
  /** answer label -> entries that chose it (including "— no answer —") */
  buckets: Array<{
    label: string;
    entries: string[]; // displayNames
    isFavored?: boolean; // highlight if the next pick would benefit this bucket
  }>;
  /**
   * For count-based props (totals / over-under on a count), the running tally
   * vs. the threshold so users can see where it stands at a glance.
   */
  tally?: {
    current: number;
    threshold: number;
    label: string;       // e.g. "QBs taken" or "SEC players"
    maxPossible?: number; // e.g. 10 for a top-10 defensive count
  };
}

function normalizePlayerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\bjr\.?\b/gi, '')
    .replace(/\bsr\.?\b/gi, '')
    .replace(/\biii\b/gi, '')
    .replace(/\bii\b/gi, '')
    .replace(/[.,']/g, '')
    .trim();
}

function bucketEntries(
  entries: Entry[],
  questionId: string,
  keyFn: (rawAnswer: unknown) => string | null,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of entries) {
    const ans = e.picks?.[questionId];
    const key = keyFn(ans);
    if (key === null) continue;
    const list = map.get(key) || [];
    list.push(e.displayName);
    map.set(key, list);
  }
  for (const [k, v] of map) v.sort((a, b) => a.localeCompare(b));
  return map;
}

const DEFENSIVE_POSITIONS = ['EDGE', 'DT', 'LB', 'CB', 'S'];
const OL_POSITIONS = ['OT', 'IOL', 'G', 'C', 'OL'];

export function computeOnTheLine(
  questions: Question[],
  entries: Entry[],
  picks: DraftPickLite[],
  nextPickNum: number | null,
): OnTheLineItem[] {
  if (nextPickNum === null) return []; // draft complete

  // Helper: is a specific player already drafted?
  const pickedNames = new Set(picks.map(p => normalizePlayerName(p.playerName)));
  const pickByNormalizedName = new Map(picks.map(p => [normalizePlayerName(p.playerName), p]));
  const pickedPositions = picks.map(p => p.position);

  const items: OnTheLineItem[] = [];

  for (const q of questions) {
    const rule = q.scoringRule || {};
    const ruleType = (rule as { type?: string }).type;
    if (!ruleType) continue;

    // Skip props with no submitted answers
    const anyAnswers = entries.some(e => {
      const v = e.picks?.[q.id];
      return v !== undefined && v !== null && v !== '';
    });
    if (!anyAnswers) continue;

    switch (ruleType) {
      // ================================================================
      case 'specific_pick_player': {
        const pickNum = (rule as { pickNumber?: number }).pickNumber;
        if (typeof pickNum !== 'number') break;
        if (picks.find(p => p.pickNumber === pickNum)) break; // already resolved
        if (nextPickNum !== pickNum) break; // only live on that exact pick
        const buckets = bucketEntries(entries, q.id, (ans) => {
          if (typeof ans !== 'string' || !ans.trim()) return '— no answer —';
          return ans.trim();
        });
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence: 0, // exactly this pick
          urgency: 'This pick',
          explainer: `Decided by pick #${pickNum}.`,
          buckets: Array.from(buckets.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([label, entriesList]) => ({ label, entries: entriesList })),
        });
        break;
      }

      // ================================================================
      case 'player_pick_number': {
        const playerName = (rule as { playerName?: string }).playerName;
        const threshold = (rule as { threshold?: number }).threshold;
        if (!playerName || typeof threshold !== 'number') break;
        const normalized = normalizePlayerName(playerName);
        const existingPick = pickByNormalizedName.get(normalized);
        if (existingPick) break; // already resolved
        // If we're past the threshold with no pick, it's already decided Over
        if (nextPickNum > threshold) break;

        const buckets = bucketEntries(entries, q.id, (ans) => {
          if (ans === 'Over' || ans === 'Under') return ans as string;
          return null;
        });
        // What would the next pick mean?
        // If the selected player is taken at nextPickNum (or earlier) → Under
        // If nextPickNum goes past threshold without him → Over
        const under = buckets.get('Under') || [];
        const over = buckets.get('Over') || [];
        const remainingBeforeThreshold = Math.max(0, Math.ceil(threshold) - nextPickNum + 1);
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          // Distance from the upcoming pick to the threshold. Player-O/U
          // questions with a near threshold bubble to the top.
          imminence: Math.max(0, threshold - nextPickNum),
          urgency: remainingBeforeThreshold <= 1 ? 'This pick' : `Next ${remainingBeforeThreshold} picks`,
          explainer:
            `${playerName} not yet picked. ` +
            `If he goes at #${nextPickNum}, Under wins. ` +
            `If he falls past ${threshold}, Over wins.`,
          buckets: [
            { label: 'Under', entries: under, isFavored: false },
            { label: 'Over', entries: over, isFavored: false },
          ],
        });
        break;
      }

      // ================================================================
      case 'player_pick_range': {
        const playerName = (rule as { playerName?: string }).playerName;
        if (!playerName) break;
        const normalized = normalizePlayerName(playerName);
        if (pickedNames.has(normalized)) break;

        const buckets = bucketEntries(entries, q.id, (ans) => {
          if (typeof ans !== 'string') return null;
          return ans;
        });

        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          // Can resolve any time — treat as mid-priority
          imminence: 8,
          urgency: 'Ongoing',
          explainer:
            `${playerName} not yet picked. Each slot tips the answer — currently ` +
            `at pick #${nextPickNum}.`,
          buckets: Array.from(buckets.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([label, entriesList]) => ({ label, entries: entriesList })),
        });
        break;
      }

      // ================================================================
      case 'first_overall_pick': {
        if (nextPickNum !== 1) break;
        if (picks.find(p => p.pickNumber === 1)) break;
        const buckets = bucketEntries(entries, q.id, (ans) =>
          typeof ans === 'string' && ans.trim() ? ans : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence: 0,
          urgency: 'This pick',
          explainer: 'Decided by pick #1.',
          buckets: Array.from(buckets.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([label, entriesList]) => ({ label, entries: entriesList })),
        });
        break;
      }

      // ================================================================
      case 'first_at_position': {
        const pos = (rule as { position?: string }).position;
        if (!pos) break;
        if (pickedPositions.includes(pos)) break; // resolved
        const buckets = bucketEntries(entries, q.id, (ans) =>
          typeof ans === 'string' && ans.trim() ? ans : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence: 6,
          urgency: 'Ongoing',
          explainer: `No ${pos} has gone yet. First one clinches it.`,
          buckets: Array.from(buckets.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([label, entriesList]) => ({ label, entries: entriesList })),
        });
        break;
      }

      // ================================================================
      case 'first_at_position_group': {
        const positions = (rule as { positions?: string[] }).positions || [];
        if (positions.some(p => pickedPositions.includes(p))) break; // resolved
        const buckets = bucketEntries(entries, q.id, (ans) =>
          typeof ans === 'string' && ans.trim() ? ans : null,
        );
        const label = positions.every(p => OL_POSITIONS.includes(p)) ? 'OL' : positions.join('/');
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence: 6,
          urgency: 'Ongoing',
          explainer: `No ${label} has gone yet. First one clinches it.`,
          buckets: Array.from(buckets.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([label, entriesList]) => ({ label, entries: entriesList })),
        });
        break;
      }

      // ================================================================
      case 'nth_at_position': {
        const pos = (rule as { position?: string }).position;
        const n = (rule as { n?: number }).n;
        if (!pos || typeof n !== 'number') break;
        const countSoFar = picks.filter(p => p.position === pos).length;
        if (countSoFar >= n) break; // resolved
        // Only show once we're close: we've already picked n-1, so the very
        // next one at position decides it
        if (n - countSoFar > 2) break;
        const buckets = bucketEntries(entries, q.id, (ans) =>
          typeof ans === 'string' && ans.trim() ? ans : null,
        );
        const ord = n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          // 0 if next one clinches, 1-2 if we need a couple more
          imminence: Math.max(0, n - countSoFar - 1),
          urgency: countSoFar === n - 1 ? 'Next one clinches' : 'Close',
          explainer: `${countSoFar} ${pos}${countSoFar === 1 ? '' : 's'} gone — ${ord} ${pos} decides it.`,
          buckets: Array.from(buckets.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([label, entriesList]) => ({ label, entries: entriesList })),
        });
        break;
      }

      // ================================================================
      case 'position_count': {
        const pos = (rule as { position?: string }).position;
        const threshold = (rule as { threshold?: number }).threshold;
        if (!pos || typeof threshold !== 'number') break;
        const count = picks.filter(p => p.position === pos).length;
        const remaining = 32 - picks.length;
        if (count > threshold) break; // already resolved Over
        if (count + remaining < threshold) break; // already resolved Under

        // How many more of this position before Over locks in?
        const picksUntilTip = Math.max(0, Math.ceil(threshold - count));
        // Closer to tipping = more imminent. Far-from-tipping but still live
        // stays visible so users always see the tally.
        const imminence = picksUntilTip <= 1 ? 2 : picksUntilTip <= 2 ? 5 : 9;

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Over' || ans === 'Under' ? ans as string : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence,
          urgency: picksUntilTip <= 1 ? 'One away from Over' : 'Ongoing',
          explainer: `${count} ${pos}${count === 1 ? '' : 's'} taken. Threshold: ${threshold}.`,
          tally: {
            current: count,
            threshold,
            label: `${pos}${count === 1 ? '' : 's'} drafted`,
          },
          buckets: [
            { label: 'Over', entries: buckets.get('Over') || [] },
            { label: 'Under', entries: buckets.get('Under') || [] },
          ],
        });
        break;
      }

      // ================================================================
      case 'conference_count': {
        const conf = (rule as { conference?: string }).conference;
        const threshold = (rule as { threshold?: number }).threshold;
        if (!conf || typeof threshold !== 'number') break;
        const count = picks.filter(p => p.conference === conf).length;
        const remaining = 32 - picks.length;
        if (count > threshold) break;
        if (count + remaining < threshold) break;

        const picksUntilTip = Math.max(0, Math.ceil(threshold - count));
        const imminence = picksUntilTip <= 1 ? 3 : picksUntilTip <= 3 ? 7 : 11;

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Over' || ans === 'Under' ? ans as string : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence,
          urgency: picksUntilTip <= 1 ? 'One away from Over' : 'Ongoing',
          explainer: `${count} ${conf} player${count === 1 ? '' : 's'} taken. Threshold: ${threshold}.`,
          tally: {
            current: count,
            threshold,
            label: `${conf} players`,
          },
          buckets: [
            { label: 'Over', entries: buckets.get('Over') || [] },
            { label: 'Under', entries: buckets.get('Under') || [] },
          ],
        });
        break;
      }

      // ================================================================
      case 'state_count': {
        const colleges = (rule as { colleges?: string[] }).colleges || [];
        const threshold = (rule as { threshold?: number }).threshold;
        if (colleges.length === 0 || typeof threshold !== 'number') break;
        const collegeSet = new Set(colleges.map(c => c.toLowerCase()));
        const count = picks.filter(p => collegeSet.has(p.college.toLowerCase())).length;
        const remaining = 32 - picks.length;
        if (count > threshold) break;
        if (count + remaining < threshold) break;

        const picksUntilTip = Math.max(0, Math.ceil(threshold - count));
        const imminence = picksUntilTip <= 1 ? 3 : picksUntilTip <= 3 ? 7 : 11;

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Over' || ans === 'Under' ? ans as string : null,
        );
        // Label pulled from the question text if possible (e.g. "state of Ohio")
        const stateName = q.questionText.match(/state of (\w+)/i)?.[1] || 'State';
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence,
          urgency: picksUntilTip <= 1 ? 'One away from Over' : 'Ongoing',
          explainer: `${count} pick${count === 1 ? '' : 's'} so far from eligible colleges. Threshold: ${threshold}.`,
          tally: {
            current: count,
            threshold,
            label: `${stateName} picks`,
          },
          buckets: [
            { label: 'Over', entries: buckets.get('Over') || [] },
            { label: 'Under', entries: buckets.get('Under') || [] },
          ],
        });
        break;
      }

      // ================================================================
      case 'trade_in_range': {
        const start = (rule as { pickStart?: number }).pickStart;
        const end = (rule as { pickEnd?: number }).pickEnd;
        if (typeof start !== 'number' || typeof end !== 'number') break;
        if (nextPickNum > end) break; // past the range

        const rangePicks = picks.filter(p => p.pickNumber >= start && p.pickNumber <= end);
        const alreadyTraded = rangePicks.some(p => p.isTrade);
        if (alreadyTraded) break; // Yes locked in
        if (rangePicks.length >= end - start + 1) break; // all picks in range are in without trade → No locked

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Yes' || ans === 'No' ? ans as string : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          // 0 if we're currently in the range, else picks until we enter it
          imminence: nextPickNum >= start && nextPickNum <= end ? 0 : Math.max(0, start - nextPickNum),
          urgency: nextPickNum >= start && nextPickNum <= end ? 'In range' : 'Coming up',
          explainer: `Watching picks #${start}-${end} for a trade. ${rangePicks.length} of ${end - start + 1} in without one.`,
          buckets: [
            { label: 'Yes', entries: buckets.get('Yes') || [] },
            { label: 'No', entries: buckets.get('No') || [] },
          ],
        });
        break;
      }

      // ================================================================
      case 'trade_count': {
        const threshold = (rule as { threshold?: number }).threshold;
        if (typeof threshold !== 'number') break;
        // Count distinct trade transactions (pick-for-pick swaps = 1, not 2)
        const tradeCount = countDistinctTrades(picks);
        const remaining = 32 - picks.length;
        if (tradeCount > threshold) break; // Over locked
        if (tradeCount + remaining < threshold) break; // Under locked

        const picksUntilTip = Math.max(0, Math.ceil(threshold - tradeCount));
        const imminence = picksUntilTip <= 1 ? 3 : picksUntilTip <= 3 ? 7 : 11;

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Over' || ans === 'Under' ? ans as string : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence,
          urgency: picksUntilTip <= 1 ? 'One away from Over' : 'Ongoing',
          explainer: `${tradeCount} trade${tradeCount === 1 ? '' : 's'} so far. Threshold: ${threshold}.`,
          tally: {
            current: tradeCount,
            threshold,
            label: `Trades in Round 1`,
          },
          buckets: [
            { label: 'Over', entries: buckets.get('Over') || [] },
            { label: 'Under', entries: buckets.get('Under') || [] },
          ],
        });
        break;
      }

      // ================================================================
      case 'heisman_finalist_drafted': {
        // Imported dynamically to avoid a cycle — hardcoded names here.
        const finalists = ['Diego Pavia', 'Jeremiyah Love', 'Julian Sayin'];
        const drafted = finalists.some(h => pickedNames.has(normalizePlayerName(h)));
        if (drafted) break; // Yes locked
        if (picks.length >= 32) break; // No locked

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Yes' || ans === 'No' ? ans as string : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence: 15, // can resolve any pick — treat as background
          urgency: 'Ongoing',
          explainer: `None of the non-winner finalists have been drafted yet.`,
          buckets: [
            { label: 'Yes', entries: buckets.get('Yes') || [] },
            { label: 'No', entries: buckets.get('No') || [] },
          ],
        });
        break;
      }

      // ================================================================
      case 'college_in_top_n': {
        const college = (rule as { college?: string }).college;
        const n = (rule as { topN?: number }).topN;
        if (!college || typeof n !== 'number') break;
        if (nextPickNum > n) break; // range passed
        const hit = picks.some(p => p.pickNumber <= n && p.college.toLowerCase() === college.toLowerCase());
        if (hit) break; // Yes locked

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Yes' || ans === 'No' ? ans as string : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          // Picks remaining in the top-N window
          imminence: Math.max(0, n - picks.length),
          urgency: `Through pick #${n}`,
          explainer: `No ${college} player drafted in the top ${n} yet.`,
          buckets: [
            { label: 'Yes', entries: buckets.get('Yes') || [] },
            { label: 'No', entries: buckets.get('No') || [] },
          ],
        });
        break;
      }

      // ================================================================
      case 'defensive_top_n': {
        const n = (rule as { n?: number }).n;
        const threshold = (rule as { threshold?: number }).threshold;
        if (typeof n !== 'number' || typeof threshold !== 'number') break;
        if (picks.length >= n) break; // top N is set
        const topNPicks = picks.filter(p => p.pickNumber <= n);
        const defCount = topNPicks.filter(p => DEFENSIVE_POSITIONS.includes(p.position)).length;
        const remaining = n - topNPicks.length;
        if (defCount > threshold) break;
        if (defCount + remaining < threshold) break;

        const buckets = bucketEntries(entries, q.id, (ans) =>
          ans === 'Over' || ans === 'Under' ? ans as string : null,
        );
        items.push({
          questionId: q.id,
          questionText: q.questionText,
          points: q.points,
          imminence: Math.max(0, n - picks.length),
          urgency: `Through pick #${n}`,
          explainer: `${defCount} defensive players in top ${topNPicks.length}. Threshold: ${threshold}.`,
          tally: {
            current: defCount,
            threshold,
            label: `Defensive players in top ${n}`,
            maxPossible: n,
          },
          buckets: [
            { label: 'Over', entries: buckets.get('Over') || [] },
            { label: 'Under', entries: buckets.get('Under') || [] },
          ],
        });
        break;
      }
    }
  }

  // Sort by imminence ascending (most-imminent first). Higher point value
  // breaks ties so a 3-pt prop outranks a 1-pt prop when both are equally
  // close to resolving.
  items.sort((a, b) => a.imminence - b.imminence || b.points - a.points);
  return items;
}
