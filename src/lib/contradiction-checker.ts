// Checks for contradictions between a user's prop answers and their mock draft picks
// Returns an array of contradiction warnings

import { DRAFT_ORDER_2026 } from './draft-order';

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
  points: number;
  category: string;
  scoringRule: Record<string, unknown> | null;
}

interface Prospect {
  rank: number;
  name: string;
  position: string;
  college: string;
  conference: string;
}

export interface Contradiction {
  questionId: string;
  questionText: string;
  propAnswer: string;
  mockDetail: string;
  message: string;
}

const DEFENSIVE_POSITIONS = ['EDGE', 'DT', 'LB', 'CB', 'S'];

export function findContradictions(
  questions: Question[],
  propAnswers: Record<string, unknown>,
  mockPicks: Record<number, string>, // pickNumber -> playerName
  prospects: Prospect[],
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const prospectMap = new Map(prospects.map(p => [p.name, p]));

  // Build derived data from mock
  const mockEntries = Object.entries(mockPicks)
    .map(([pick, name]) => ({ pick: Number(pick), name, prospect: prospectMap.get(name) }))
    .filter(e => e.prospect)
    .sort((a, b) => a.pick - b.pick);

  // Position counts in mock
  const positionCounts: Record<string, number> = {};
  const conferenceCountsInMock: Record<string, number> = {};
  const positionFirstPick: Record<string, { name: string; pick: number }> = {};
  const positionNthPick: Record<string, { name: string; pick: number }[]> = {};

  for (const entry of mockEntries) {
    const pos = entry.prospect!.position;
    const conf = entry.prospect!.conference;

    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    conferenceCountsInMock[conf] = (conferenceCountsInMock[conf] || 0) + 1;

    if (!positionFirstPick[pos]) {
      positionFirstPick[pos] = { name: entry.name, pick: entry.pick };
    }

    if (!positionNthPick[pos]) positionNthPick[pos] = [];
    positionNthPick[pos].push({ name: entry.name, pick: entry.pick });
  }

  // Defensive players in top N
  const defensiveInTopN = (n: number) =>
    mockEntries.filter(e => e.pick <= n && DEFENSIVE_POSITIONS.includes(e.prospect!.position)).length;

  // Player pick lookup
  const playerPickMap = new Map(mockEntries.map(e => [e.name, e.pick]));

  for (const q of questions) {
    const answer = propAnswers[q.id];
    if (answer === undefined || answer === null || answer === '') continue;
    const rule = q.scoringRule;
    if (!rule) continue;

    const ruleType = rule.type as string;

    try {
      // --- first_overall_pick ---
      if (ruleType === 'first_overall_pick') {
        const pick1 = mockPicks[1];
        if (pick1) {
          const answerStr = answer as string;
          // Extract player name from answer option like "Fernando Mendoza (Indiana, QB)"
          const answerName = answerStr.split(' (')[0];
          if (answerStr !== 'Other' && pick1 !== answerName) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `You mocked ${pick1} at #1`,
              message: `You picked "${answerStr}" as the 1st overall pick, but you mocked ${pick1} at #1.`,
            });
          }
        }
      }

      // --- first_at_position ---
      if (ruleType === 'first_at_position') {
        const pos = rule.position as string;
        const firstAtPos = positionFirstPick[pos];
        if (firstAtPos) {
          const answerStr = answer as string;
          const answerName = answerStr.split(' (')[0];
          if (answerStr !== 'Other' && firstAtPos.name !== answerName) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `You mocked ${firstAtPos.name} as the 1st ${pos} (pick #${firstAtPos.pick})`,
              message: `You picked "${answerStr}" as the 1st ${pos} selected, but your mock has ${firstAtPos.name} as the 1st ${pos} at pick #${firstAtPos.pick}.`,
            });
          }
        }
      }

      // --- first_at_position_group (e.g., first OL) ---
      if (ruleType === 'first_at_position_group') {
        const positions = rule.positions as string[];
        const firstOL = mockEntries.find(e => positions.includes(e.prospect!.position));
        if (firstOL) {
          const answerStr = answer as string;
          const answerName = answerStr.split(' (')[0];
          if (answerStr !== 'Other' && firstOL.name !== answerName) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `You mocked ${firstOL.name} as the 1st OL (pick #${firstOL.pick})`,
              message: `You picked "${answerStr}" as the 1st Offensive Lineman, but your mock has ${firstOL.name} first at pick #${firstOL.pick}.`,
            });
          }
        }
      }

      // --- nth_at_position (e.g., 2nd QB) ---
      if (ruleType === 'nth_at_position') {
        const pos = rule.position as string;
        const n = rule.n as number;
        const atPos = positionNthPick[pos] || [];
        const answerStr = answer as string;

        if (answerStr === `No ${n === 2 ? '2nd' : `${n}th`} ${pos} in Round 1` || answerStr.includes('No 2nd')) {
          // User says no Nth player at this position — check if mock has N or more
          if (atPos.length >= n) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `You mocked ${atPos.length} ${pos}s in Round 1`,
              message: `You said there won't be a ${n === 2 ? '2nd' : `${n}th`} ${pos} in Round 1, but your mock has ${atPos.length} ${pos}s.`,
            });
          }
        } else if (answerStr !== 'Other' && atPos.length >= n) {
          const nthPlayer = atPos[n - 1];
          const answerName = answerStr.split(' (')[0];
          if (nthPlayer.name !== answerName) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `Your mock has ${nthPlayer.name} as the ${n === 2 ? '2nd' : `${n}th`} ${pos} (pick #${nthPlayer.pick})`,
              message: `You picked "${answerStr}" as the ${n === 2 ? '2nd' : `${n}th`} ${pos}, but your mock has ${nthPlayer.name} at pick #${nthPlayer.pick}.`,
            });
          }
        }
      }

      // --- position_count (Over/Under on position totals) ---
      if (ruleType === 'position_count') {
        const pos = rule.position as string;
        const threshold = rule.threshold as number;
        const count = positionCounts[pos] || 0;
        const answerStr = answer as string;

        if (answerStr === 'Over' && count <= Math.floor(threshold)) {
          contradictions.push({
            questionId: q.id,
            questionText: q.questionText,
            propAnswer: 'Over',
            mockDetail: `Your mock only has ${count} ${pos}s`,
            message: `You said Over ${threshold} ${pos}s, but your mock only has ${count}.`,
          });
        } else if (answerStr === 'Under' && count >= Math.ceil(threshold)) {
          contradictions.push({
            questionId: q.id,
            questionText: q.questionText,
            propAnswer: 'Under',
            mockDetail: `Your mock has ${count} ${pos}s`,
            message: `You said Under ${threshold} ${pos}s, but your mock has ${count}.`,
          });
        }
      }

      // --- defensive_top_n ---
      if (ruleType === 'defensive_top_n') {
        const n = rule.n as number;
        const threshold = rule.threshold as number;
        const count = defensiveInTopN(n);
        const answerStr = answer as string;

        if (answerStr === 'Over' && count <= Math.floor(threshold)) {
          contradictions.push({
            questionId: q.id,
            questionText: q.questionText,
            propAnswer: 'Over',
            mockDetail: `Your mock has ${count} defensive players in the top ${n}`,
            message: `You said Over ${threshold} defensive players in the top ${n}, but your mock only has ${count}.`,
          });
        } else if (answerStr === 'Under' && count >= Math.ceil(threshold)) {
          contradictions.push({
            questionId: q.id,
            questionText: q.questionText,
            propAnswer: 'Under',
            mockDetail: `Your mock has ${count} defensive players in the top ${n}`,
            message: `You said Under ${threshold} defensive players in the top ${n}, but your mock has ${count}.`,
          });
        }
      }

      // --- player_pick_number (Over/Under on a specific player's pick) ---
      if (ruleType === 'player_pick_number') {
        const playerName = rule.playerName as string;
        const threshold = rule.threshold as number;
        const pickNum = playerPickMap.get(playerName);
        const answerStr = answer as string;

        if (pickNum !== undefined) {
          if (answerStr === 'Over' && pickNum <= Math.floor(threshold)) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: 'Over',
              mockDetail: `You mocked ${playerName} at pick #${pickNum}`,
              message: `You said ${playerName}'s pick will be Over ${threshold}, but you mocked him at #${pickNum}.`,
            });
          } else if (answerStr === 'Under' && pickNum >= Math.ceil(threshold)) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: 'Under',
              mockDetail: `You mocked ${playerName} at pick #${pickNum}`,
              message: `You said ${playerName}'s pick will be Under ${threshold}, but you mocked him at #${pickNum}.`,
            });
          }
        }
      }

      // --- conference_count ---
      if (ruleType === 'conference_count') {
        const conf = rule.conference as string;
        const threshold = rule.threshold as number;
        const count = conferenceCountsInMock[conf] || 0;
        const answerStr = answer as string;

        // Only flag if mock is complete enough (at least 20 picks)
        if (Object.keys(mockPicks).length >= 20) {
          if (answerStr === 'Over' && count <= Math.floor(threshold)) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: 'Over',
              mockDetail: `Your mock has ${count} ${conf} players`,
              message: `You said Over ${threshold} ${conf} players, but your mock only has ${count}.`,
            });
          } else if (answerStr === 'Under' && count >= Math.ceil(threshold)) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: 'Under',
              mockDetail: `Your mock has ${count} ${conf} players`,
              message: `You said Under ${threshold} ${conf} players, but your mock has ${count}.`,
            });
          }
        }
      }

      // --- specific_pick_player (e.g., name the player at pick #2) ---
      if (ruleType === 'specific_pick_player') {
        const pickNumber = rule.pickNumber as number;
        const mockedPlayer = mockPicks[pickNumber];
        const answerStr = answer as string;

        if (mockedPlayer && answerStr && mockedPlayer !== answerStr) {
          const team = DRAFT_ORDER_2026.find(d => d.pick === pickNumber)?.team || `Pick #${pickNumber}`;
          contradictions.push({
            questionId: q.id,
            questionText: q.questionText,
            propAnswer: answerStr,
            mockDetail: `You mocked ${mockedPlayer} at #${pickNumber}`,
            message: `You predicted "${answerStr}" at pick #${pickNumber}, but your mock has ${mockedPlayer} there.`,
          });
        }
      }

      // --- player_pick_range ---
      if (ruleType === 'player_pick_range') {
        const playerName = rule.playerName as string;
        const pickNum = playerPickMap.get(playerName);
        const answerStr = answer as string;

        if (pickNum !== undefined && answerStr) {
          // Parse range like "2-3", "4-5", "6-10", "11+/Not in Round 1"
          const inRange = isPickInRange(pickNum, answerStr);
          if (!inRange) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `You mocked ${playerName} at pick #${pickNum}`,
              message: `You predicted ${playerName} would go ${answerStr}, but you mocked him at pick #${pickNum}.`,
            });
          }
        }
      }

      // --- first_position_pick_range ---
      if (ruleType === 'first_position_pick_range') {
        const pos = rule.position as string;
        const firstAtPos = positionFirstPick[pos];
        const answerStr = answer as string;

        if (firstAtPos && answerStr) {
          const inRange = isPickInRange(firstAtPos.pick, answerStr);
          if (!inRange) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `Your mock has the 1st ${pos} at pick #${firstAtPos.pick} (${firstAtPos.name})`,
              message: `You predicted the 1st ${pos} would go ${answerStr}, but your mock has ${firstAtPos.name} at pick #${firstAtPos.pick}.`,
            });
          }
        }
      }

      // --- conference_most_picks ---
      if (ruleType === 'conference_most_picks' && Object.keys(mockPicks).length >= 20) {
        const answerStr = answer as string;
        if (answerStr && answerStr !== 'Other') {
          const sorted = Object.entries(conferenceCountsInMock).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0 && sorted[0][0] !== answerStr) {
            contradictions.push({
              questionId: q.id,
              questionText: q.questionText,
              propAnswer: answerStr,
              mockDetail: `Your mock has ${sorted[0][0]} with the most picks (${sorted[0][1]})`,
              message: `You said ${answerStr} will have the most picks, but your mock has ${sorted[0][0]} leading with ${sorted[0][1]}.`,
            });
          }
        }
      }

      // --- ordering ---
      if (ruleType === 'ordering') {
        const players = rule.players as string[];
        const userOrder = answer as string[];
        if (Array.isArray(userOrder) && userOrder.length > 0) {
          // Check if mock ordering contradicts prop ordering
          const mockOrder = userOrder
            .map(name => ({ name, pick: playerPickMap.get(name) }))
            .filter(e => e.pick !== undefined);

          if (mockOrder.length >= 2) {
            for (let i = 0; i < mockOrder.length - 1; i++) {
              for (let j = i + 1; j < mockOrder.length; j++) {
                if (mockOrder[i].pick! > mockOrder[j].pick!) {
                  contradictions.push({
                    questionId: q.id,
                    questionText: q.questionText,
                    propAnswer: `${mockOrder[i].name} before ${mockOrder[j].name}`,
                    mockDetail: `Your mock has ${mockOrder[j].name} at #${mockOrder[j].pick} before ${mockOrder[i].name} at #${mockOrder[i].pick}`,
                    message: `Your ordering has ${mockOrder[i].name} before ${mockOrder[j].name}, but your mock has them reversed (#${mockOrder[j].pick} vs #${mockOrder[i].pick}).`,
                  });
                  break; // Only show first ordering conflict
                }
              }
              if (contradictions.length > 0 && contradictions[contradictions.length - 1].questionId === q.id) break;
            }
          }
        }
      }

    } catch {
      // Skip any malformed rules
    }
  }

  return contradictions;
}

function isPickInRange(pick: number, rangeStr: string): boolean {
  // Handle formats like "2-3", "4-5", "6-10", "11+/Not in Round 1", "1-5", "25-32"
  if (rangeStr.includes('+') || rangeStr.includes('Not in')) {
    // "11+/Not in Round 1" → pick must be >= 11 or not picked
    const min = parseInt(rangeStr);
    return !isNaN(min) && pick >= min;
  }

  const parts = rangeStr.split('-').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return pick >= parts[0] && pick <= parts[1];
  }

  return true; // Can't parse, don't flag
}
