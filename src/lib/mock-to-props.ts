// Infers prop answers from a user's mock draft picks
// Returns a map of questionId -> inferred answer

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

const DEFENSIVE_POSITIONS = ['EDGE', 'DT', 'LB', 'CB', 'S'];

function normalizeName(name: string): string {
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

export function inferPropsFromMock(
  questions: Question[],
  mockPicks: Record<number, string>, // pickNumber -> playerName
  prospects: Prospect[],
): Record<string, { value: unknown; reason: string }> {
  const inferred: Record<string, { value: unknown; reason: string }> = {};
  // Build two lookups: exact and normalized, so a small punctuation/case mismatch
  // between the mock player name and the prospects list doesn't silently drop the entry.
  const prospectMap = new Map(prospects.map(p => [p.name, p]));
  const normalizedProspectMap = new Map(prospects.map(p => [normalizeName(p.name), p]));

  // Build derived data from mock
  const mockEntries = Object.entries(mockPicks)
    .map(([pick, name]) => ({
      pick: Number(pick),
      name,
      prospect: prospectMap.get(name) || normalizedProspectMap.get(normalizeName(name)),
    }))
    .filter(e => e.prospect)
    .sort((a, b) => a.pick - b.pick);

  if (mockEntries.length === 0) return inferred;

  // Position tracking
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

  const defensiveInTopN = (n: number) =>
    mockEntries.filter(e => e.pick <= n && DEFENSIVE_POSITIONS.includes(e.prospect!.position)).length;

  const playerPickMap = new Map(mockEntries.map(e => [e.name, e.pick]));
  const normalizedPlayerPickMap = new Map(mockEntries.map(e => [normalizeName(e.name), e.pick]));

  // Helper: look up a mocked player's pick by name, tolerating small formatting differences
  const findPlayerPick = (name: string): number | undefined =>
    playerPickMap.get(name) ?? normalizedPlayerPickMap.get(normalizeName(name));
  const mockSize = Object.keys(mockPicks).length;

  for (const q of questions) {
    const rule = q.scoringRule;
    if (!rule) continue;
    const ruleType = rule.type as string;
    const options = q.answerOptions || [];

    try {
      // --- first_overall_pick ---
      if (ruleType === 'first_overall_pick' && mockPicks[1]) {
        const player = mockPicks[1];
        // Find matching answer option (format: "Fernando Mendoza (Indiana, QB)")
        const match = options.find(opt => opt.startsWith(player + ' ('));
        if (match) {
          inferred[q.id] = { value: match, reason: `You mocked ${player} at #1` };
        } else if (options.includes('Other')) {
          inferred[q.id] = { value: 'Other', reason: `You mocked ${player} at #1 (not listed)` };
        }
      }

      // --- first_at_position ---
      if (ruleType === 'first_at_position') {
        const pos = rule.position as string;
        const first = positionFirstPick[pos];
        if (first) {
          const match = options.find(opt => opt.startsWith(first.name + ' (') || opt === first.name);
          if (match) {
            inferred[q.id] = { value: match, reason: `${first.name} is your 1st ${pos} at pick #${first.pick}` };
          } else if (options.includes('Other')) {
            inferred[q.id] = { value: 'Other', reason: `${first.name} is your 1st ${pos} (not listed)` };
          }
        }
      }

      // --- first_at_position_group (e.g., first OL) ---
      if (ruleType === 'first_at_position_group') {
        const positions = rule.positions as string[];
        const firstOL = mockEntries.find(e => positions.includes(e.prospect!.position));
        if (firstOL) {
          const match = options.find(opt => opt.startsWith(firstOL.name + ' (') || opt === firstOL.name);
          if (match) {
            inferred[q.id] = { value: match, reason: `${firstOL.name} is your 1st OL at pick #${firstOL.pick}` };
          } else if (options.includes('Other')) {
            inferred[q.id] = { value: 'Other', reason: `${firstOL.name} is your 1st OL (not listed)` };
          }
        }
      }

      // --- nth_at_position ---
      if (ruleType === 'nth_at_position') {
        const pos = rule.position as string;
        const n = rule.n as number;
        const atPos = positionNthPick[pos] || [];

        if (atPos.length >= n) {
          const nthPlayer = atPos[n - 1];
          const match = options.find(opt => opt.startsWith(nthPlayer.name + ' (') || opt === nthPlayer.name);
          if (match) {
            const ordinal = n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
            inferred[q.id] = { value: match, reason: `${nthPlayer.name} is your ${ordinal} ${pos} at pick #${nthPlayer.pick}` };
          } else if (options.includes('Other')) {
            const ordinal = n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
            inferred[q.id] = { value: 'Other', reason: `${nthPlayer.name} is your ${ordinal} ${pos} (not listed)` };
          }
        } else if (atPos.length < n) {
          // Not enough players at this position — check for "No Nth" option
          const noOption = options.find(opt => opt.toLowerCase().includes('no ') && opt.toLowerCase().includes(pos.toLowerCase()));
          if (noOption && mockSize >= 20) {
            // Only infer "no Nth" if mock is substantially filled
            inferred[q.id] = { value: noOption, reason: `Your mock only has ${atPos.length} ${pos}(s) in Round 1` };
          }
        }
      }

      // --- position_count (Over/Under) ---
      if (ruleType === 'position_count' && mockSize >= 20) {
        const pos = rule.position as string;
        const threshold = rule.threshold as number;
        const count = positionCounts[pos] || 0;

        if (count > threshold) {
          inferred[q.id] = { value: 'Over', reason: `Your mock has ${count} ${pos}s (threshold: ${threshold})` };
        } else if (count < threshold) {
          inferred[q.id] = { value: 'Under', reason: `Your mock has ${count} ${pos}s (threshold: ${threshold})` };
        }
      }

      // --- defensive_top_n ---
      if (ruleType === 'defensive_top_n') {
        const n = rule.n as number;
        const threshold = rule.threshold as number;
        const count = defensiveInTopN(n);
        // Only need top N picks filled to infer this
        const topNFilled = mockEntries.filter(e => e.pick <= n).length;

        if (topNFilled >= n) {
          if (count > threshold) {
            inferred[q.id] = { value: 'Over', reason: `Your mock has ${count} defensive players in the top ${n}` };
          } else if (count < threshold) {
            inferred[q.id] = { value: 'Under', reason: `Your mock has ${count} defensive players in the top ${n}` };
          }
        }
      }

      // --- player_pick_number ---
      if (ruleType === 'player_pick_number') {
        const playerName = rule.playerName as string;
        const threshold = rule.threshold as number;
        const pickNum = findPlayerPick(playerName);

        if (pickNum !== undefined) {
          if (pickNum > threshold) {
            inferred[q.id] = { value: 'Over', reason: `You mocked ${playerName} at pick #${pickNum}` };
          } else if (pickNum < threshold) {
            inferred[q.id] = { value: 'Under', reason: `You mocked ${playerName} at pick #${pickNum}` };
          }
        }
      }

      // --- conference_count ---
      if (ruleType === 'conference_count' && mockSize >= 20) {
        const conf = rule.conference as string;
        const threshold = rule.threshold as number;
        const count = conferenceCountsInMock[conf] || 0;

        if (count > threshold) {
          inferred[q.id] = { value: 'Over', reason: `Your mock has ${count} ${conf} players` };
        } else if (count < threshold) {
          inferred[q.id] = { value: 'Under', reason: `Your mock has ${count} ${conf} players` };
        }
      }

      // --- specific_pick_player ---
      if (ruleType === 'specific_pick_player') {
        const pickNumber = rule.pickNumber as number;
        const mockedPlayer = mockPicks[pickNumber];
        if (mockedPlayer) {
          inferred[q.id] = { value: mockedPlayer, reason: `You mocked ${mockedPlayer} at pick #${pickNumber}` };
        }
      }

      // --- player_pick_range ---
      if (ruleType === 'player_pick_range') {
        const playerName = rule.playerName as string;
        const pickNum = findPlayerPick(playerName);

        if (pickNum !== undefined) {
          const matchingRange = options.find(opt => isPickInRange(pickNum, opt));
          if (matchingRange) {
            inferred[q.id] = { value: matchingRange, reason: `You mocked ${playerName} at pick #${pickNum}` };
          }
        }
      }

      // --- first_position_pick_range ---
      if (ruleType === 'first_position_pick_range') {
        const pos = rule.position as string;
        const first = positionFirstPick[pos];

        if (first) {
          const matchingRange = options.find(opt => isPickInRange(first.pick, opt));
          if (matchingRange) {
            inferred[q.id] = { value: matchingRange, reason: `Your 1st ${pos} is ${first.name} at pick #${first.pick}` };
          }
        }
      }

      // --- conference_most_picks ---
      if (ruleType === 'conference_most_picks' && mockSize >= 20) {
        const sorted = Object.entries(conferenceCountsInMock).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          const topConf = sorted[0][0];
          if (options.includes(topConf)) {
            inferred[q.id] = { value: topConf, reason: `Your mock has ${sorted[0][1]} ${topConf} players (most)` };
          }
        }
      }

      // --- state_count (Over/Under picks from a list of colleges) ---
      if (ruleType === 'state_count' && mockSize >= 20) {
        const colleges = (rule.colleges as string[]).map(c => c.toLowerCase());
        const threshold = rule.threshold as number;
        const count = mockEntries.filter(e =>
          colleges.includes(e.prospect!.college.toLowerCase())
        ).length;

        if (count > threshold) {
          inferred[q.id] = { value: 'Over', reason: `Your mock has ${count} picks from that state (threshold: ${threshold})` };
        } else if (count < threshold) {
          inferred[q.id] = { value: 'Under', reason: `Your mock has ${count} picks from that state (threshold: ${threshold})` };
        }
      }

      // --- college_in_top_n (Yes/No: will a player from <college> be taken in top N?) ---
      if (ruleType === 'college_in_top_n') {
        const college = (rule.college as string).toLowerCase();
        const n = rule.topN as number;
        const topNFilled = mockEntries.filter(e => e.pick <= n).length;
        const hasCollege = mockEntries.some(e =>
          e.pick <= n && e.prospect!.college.toLowerCase() === college
        );

        if (hasCollege) {
          inferred[q.id] = { value: 'Yes', reason: `Your mock has a ${rule.college} player in the top ${n}` };
        } else if (topNFilled >= n) {
          inferred[q.id] = { value: 'No', reason: `Your mock has no ${rule.college} players in the top ${n}` };
        }
      }

      // --- ordering ---
      if (ruleType === 'ordering') {
        const players = rule.players as string[];
        const withPicks = players
          .map(name => ({ name, pick: findPlayerPick(name) }))
          .filter(e => e.pick !== undefined) as { name: string; pick: number }[];

        if (withPicks.length >= 2) {
          // Sort by mock pick number, then add any unmatched players at the end
          const sorted = [...withPicks].sort((a, b) => a.pick - b.pick);
          const sortedNames = sorted.map(e => e.name);
          const unmocked = players.filter(name => findPlayerPick(name) === undefined);
          const fullOrder = [...sortedNames, ...unmocked];

          inferred[q.id] = {
            value: fullOrder,
            reason: `Based on your mock order: ${sorted.map(e => `${e.name} (#${e.pick})`).join(', ')}`,
          };
        }
      }

    } catch {
      // Skip malformed rules
    }
  }

  return inferred;
}

function isPickInRange(pick: number, rangeStr: string): boolean {
  if (rangeStr.includes('+') || rangeStr.includes('Not in')) {
    const min = parseInt(rangeStr);
    return !isNaN(min) && pick >= min;
  }
  const parts = rangeStr.split('-').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return pick >= parts[0] && pick <= parts[1];
  }
  return false;
}
