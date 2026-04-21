import { db, client } from '../db';
import { propQuestions, entries, scores, draftPicks } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import conferences from '../conferences.json';
import { scoreAllMockDrafts, getMockLeaderboard } from './mock-scoring';
import { HEISMAN_FINALISTS_2025 } from '../heisman';

const DEFENSIVE_POSITIONS = ['CB', 'S', 'LB', 'DT', 'DE', 'EDGE'];
const OL_POSITIONS = ['OT', 'IOL', 'G', 'C', 'OL'];

// Build reverse lookup: college -> conference
const collegeToConference: Record<string, string> = {};
for (const [conf, schools] of Object.entries(conferences)) {
  for (const school of schools) {
    collegeToConference[school.toLowerCase()] = conf;
  }
}

export function getConferenceForCollege(college: string): string {
  return collegeToConference[college.toLowerCase()] || 'Unknown';
}

function normalizePlayerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\bjr\.?\b/gi, '')
    .replace(/\biii\b/gi, '')
    .replace(/\bii\b/gi, '')
    .replace(/[.,]/g, '')
    .trim();
}

function playerNamesMatch(a: string, b: string): boolean {
  return normalizePlayerName(a) === normalizePlayerName(b);
}

interface DraftPick {
  pickNumber: number;
  playerName: string;
  position: string;
  college: string;
  conference: string;
  isTrade: boolean;
  originalTeam: string;
}

function resolveQuestion(
  question: typeof propQuestions.$inferSelect,
  picks: DraftPick[],
  userAnswer: unknown
): { resolved: boolean; isCorrect: boolean } | null {
  if (!userAnswer && userAnswer !== 0) return null;

  const rule = question.scoringRule as Record<string, unknown> | null;
  if (!rule) return null;

  const answer = String(userAnswer);

  switch (rule.type) {
    case 'first_overall_pick': {
      const pick1 = picks.find(p => p.pickNumber === 1);
      if (!pick1) return null;
      // Check if user's answer matches pick 1
      const options = question.answerOptions || [];
      const isOther = answer === 'Other';
      const matchesOption = options.some(opt =>
        opt !== 'Other' && opt.toLowerCase().includes(pick1.playerName.toLowerCase())
      );
      if (isOther) {
        return { resolved: true, isCorrect: !matchesOption };
      }
      const isCorrect = answer.toLowerCase().includes(pick1.playerName.toLowerCase());
      return { resolved: true, isCorrect };
    }

    case 'first_at_position': {
      const pos = rule.position as string;
      const firstAtPos = picks
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .find(p => p.position === pos);
      if (!firstAtPos) return null; // Not yet resolved
      const options = question.answerOptions || [];
      const isOther = answer === 'Other';
      const matchesOption = options.some(opt =>
        opt !== 'Other' && opt.toLowerCase().includes(firstAtPos.playerName.toLowerCase())
      );
      if (isOther) {
        return { resolved: true, isCorrect: !matchesOption };
      }
      return { resolved: true, isCorrect: answer.toLowerCase().includes(firstAtPos.playerName.toLowerCase()) };
    }

    case 'first_at_position_group': {
      const positions = rule.positions as string[];
      const firstAtPos = picks
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .find(p => positions.includes(p.position));
      if (!firstAtPos) return null;
      const options = question.answerOptions || [];
      const isOther = answer === 'Other';
      const matchesOption = options.some(opt =>
        opt !== 'Other' && opt.toLowerCase().includes(firstAtPos.playerName.toLowerCase())
      );
      if (isOther) {
        return { resolved: true, isCorrect: !matchesOption };
      }
      return { resolved: true, isCorrect: answer.toLowerCase().includes(firstAtPos.playerName.toLowerCase()) };
    }

    case 'nth_at_position': {
      const pos = rule.position as string;
      const n = rule.n as number;
      const atPos = picks.filter(p => p.position === pos).sort((a, b) => a.pickNumber - b.pickNumber);
      // If all 32 picks are in and less than n at position
      if (picks.length >= 32 && atPos.length < n) {
        return { resolved: true, isCorrect: answer === `No ${n === 2 ? '2nd' : `${n}th`} ${pos} in Round 1` || answer.includes('No ') };
      }
      if (atPos.length < n) return null;
      const nthPlayer = atPos[n - 1];
      const options = question.answerOptions || [];
      const isOther = answer === 'Other';
      const noSecond = answer.includes('No ');
      if (noSecond) return { resolved: true, isCorrect: false };
      const matchesOption = options.some(opt =>
        opt !== 'Other' && !opt.includes('No ') && opt.toLowerCase().includes(nthPlayer.playerName.toLowerCase())
      );
      if (isOther) {
        return { resolved: true, isCorrect: !matchesOption };
      }
      return { resolved: true, isCorrect: answer.toLowerCase().includes(nthPlayer.playerName.toLowerCase()) };
    }

    case 'position_count': {
      const pos = rule.position as string;
      const threshold = rule.threshold as number;
      const count = picks.filter(p => p.position === pos).length;
      // Can resolve early if already over
      if (count > threshold) {
        return { resolved: true, isCorrect: answer === 'Over' };
      }
      // Can resolve if remaining picks can't reach threshold
      const remaining = 32 - picks.length;
      if (count + remaining < threshold) {
        return { resolved: true, isCorrect: answer === 'Under' };
      }
      if (picks.length >= 32) {
        return { resolved: true, isCorrect: count > threshold ? answer === 'Over' : answer === 'Under' };
      }
      return null;
    }

    case 'defensive_top_n': {
      const n = rule.n as number;
      const threshold = rule.threshold as number;
      const topN = picks.filter(p => p.pickNumber <= n);
      if (topN.length < n && picks.length < 32) return null; // Not all top N picks are in
      const defCount = topN.filter(p => DEFENSIVE_POSITIONS.includes(p.position)).length;
      if (topN.length >= n) {
        return { resolved: true, isCorrect: defCount > threshold ? answer === 'Over' : answer === 'Under' };
      }
      return null;
    }

    case 'player_pick_number': {
      const playerName = rule.playerName as string;
      const threshold = rule.threshold as number;
      const pick = picks.find(p => playerNamesMatch(p.playerName, playerName));
      if (!pick) {
        if (picks.length >= 32) {
          // Player wasn't picked — over 1.5 means not #1, which is correct
          return { resolved: true, isCorrect: answer === 'Over' };
        }
        return null;
      }
      return { resolved: true, isCorrect: pick.pickNumber > threshold ? answer === 'Over' : answer === 'Under' };
    }

    case 'conference_count': {
      const conf = rule.conference as string;
      const threshold = rule.threshold as number;
      const count = picks.filter(p => p.conference === conf).length;
      if (count > threshold) {
        return { resolved: true, isCorrect: answer === 'Over' };
      }
      const remaining = 32 - picks.length;
      if (count + remaining < threshold) {
        return { resolved: true, isCorrect: answer === 'Under' };
      }
      if (picks.length >= 32) {
        return { resolved: true, isCorrect: count > threshold ? answer === 'Over' : answer === 'Under' };
      }
      return null;
    }

    case 'player_pick_range': {
      const playerName = rule.playerName as string;
      const pick = picks.find(p => playerNamesMatch(p.playerName, playerName));
      if (!pick) {
        if (picks.length >= 32) {
          return { resolved: true, isCorrect: answer.includes('Not in Round 1') || answer.includes('11+') };
        }
        return null;
      }
      const ranges = parseRange(answer);
      if (!ranges) return { resolved: true, isCorrect: false };
      return { resolved: true, isCorrect: pick.pickNumber >= ranges[0] && pick.pickNumber <= ranges[1] };
    }

    case 'first_position_pick_range': {
      const pos = rule.position as string;
      const firstAtPos = picks
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .find(p => p.position === pos);
      if (!firstAtPos) return null;
      const ranges = parseRange(answer);
      if (!ranges) return { resolved: true, isCorrect: false };
      return { resolved: true, isCorrect: firstAtPos.pickNumber >= ranges[0] && firstAtPos.pickNumber <= ranges[1] };
    }

    case 'specific_pick_player': {
      const pickNum = rule.pickNumber as number;
      const pick = picks.find(p => p.pickNumber === pickNum);
      if (!pick) return null;
      return { resolved: true, isCorrect: playerNamesMatch(pick.playerName, answer) };
    }

    case 'conference_most_picks': {
      if (picks.length < 32) return null;
      const confCounts: Record<string, number> = {};
      picks.forEach(p => {
        confCounts[p.conference] = (confCounts[p.conference] || 0) + 1;
      });
      const maxConf = Object.entries(confCounts).sort((a, b) => b[1] - a[1])[0][0];
      const isOther = answer === 'Other';
      const namedConfs = ['SEC', 'Big Ten', 'ACC', 'Big 12'];
      if (isOther) {
        return { resolved: true, isCorrect: !namedConfs.includes(maxConf) };
      }
      return { resolved: true, isCorrect: answer === maxConf };
    }

    case 'ordering': {
      const players = rule.players as string[];
      // Find pick numbers for each player
      const playerPicks: { name: string; pickNumber: number }[] = [];
      for (const p of players) {
        const pick = picks.find(pk => playerNamesMatch(pk.playerName, p));
        if (!pick) return null; // Not all players have been picked yet
        playerPicks.push({ name: p, pickNumber: pick.pickNumber });
      }
      // Sort by pick number to get correct order
      const correctOrder = [...playerPicks].sort((a, b) => a.pickNumber - b.pickNumber).map(p => p.name);
      const userOrder = JSON.parse(answer) as string[];

      let correctCount = 0;
      for (let i = 0; i < correctOrder.length; i++) {
        if (correctOrder[i] === userOrder[i]) correctCount++;
      }

      if (correctCount === correctOrder.length) {
        return { resolved: true, isCorrect: true }; // Full points
      }
      // Partial credit handled in scoring
      return { resolved: true, isCorrect: correctCount >= 2 };
    }

    case 'state_count': {
      const colleges = (rule.colleges as string[]).map(c => c.toLowerCase());
      const threshold = rule.threshold as number;
      const count = picks.filter(p => colleges.includes(p.college.toLowerCase())).length;
      if (count > threshold) {
        return { resolved: true, isCorrect: answer === 'Over' };
      }
      const remaining = 32 - picks.length;
      if (count + remaining < threshold) {
        return { resolved: true, isCorrect: answer === 'Under' };
      }
      if (picks.length >= 32) {
        return { resolved: true, isCorrect: count > threshold ? answer === 'Over' : answer === 'Under' };
      }
      return null;
    }

    case 'college_in_top_n': {
      // Yes/No: was a player from <college> taken in the top N picks?
      const college = (rule.college as string).toLowerCase();
      const n = rule.topN as number;
      const topNPicks = picks.filter(p => p.pickNumber <= n);
      const hasCollege = topNPicks.some(p => p.college.toLowerCase() === college);
      // Can resolve early if one has already been picked
      if (hasCollege) {
        return { resolved: true, isCorrect: answer === 'Yes' };
      }
      // Need all top N picks in before concluding "No"
      if (topNPicks.length >= n) {
        return { resolved: true, isCorrect: answer === 'No' };
      }
      return null;
    }

    case 'trade_in_range': {
      // Did a trade happen within pick range [start, end]?
      const start = rule.pickStart as number;
      const end = rule.pickEnd as number;
      const rangePicksIn = picks.filter(p => p.pickNumber >= start && p.pickNumber <= end);
      // Need all picks in range before resolving
      if (rangePicksIn.length < (end - start + 1) && picks.length < 32) return null;
      const hasTrade = rangePicksIn.some(p => p.isTrade);
      return { resolved: true, isCorrect: (answer === 'Yes') === hasTrade };
    }

    case 'trade_count': {
      // Over/under on total trades in round 1
      const tradeThreshold = rule.threshold as number;
      const tradeCount = picks.filter(p => p.isTrade).length;
      // Can resolve early if already over
      if (tradeCount > tradeThreshold) {
        return { resolved: true, isCorrect: answer === 'Over' };
      }
      // Can resolve if remaining picks can't reach threshold
      const tradeRemaining = 32 - picks.length;
      if (tradeCount + tradeRemaining < tradeThreshold) {
        return { resolved: true, isCorrect: answer === 'Under' };
      }
      if (picks.length >= 32) {
        return { resolved: true, isCorrect: tradeCount > tradeThreshold ? answer === 'Over' : answer === 'Under' };
      }
      return null;
    }

    case 'trade_first_pick': {
      // Which pick number is the first trade?
      const tradePicks = picks.filter(p => p.isTrade).sort((a, b) => a.pickNumber - b.pickNumber);
      if (picks.length >= 32 && tradePicks.length === 0) {
        // No trades at all — "No trades" answer is correct
        return { resolved: true, isCorrect: answer.includes('No trade') || answer.includes('None') };
      }
      if (tradePicks.length === 0) return null;
      const firstTrade = tradePicks[0];
      const tradeRanges = parseRange(answer);
      if (!tradeRanges) {
        // Check for "No trades" answer
        return { resolved: true, isCorrect: false };
      }
      return { resolved: true, isCorrect: firstTrade.pickNumber >= tradeRanges[0] && firstTrade.pickNumber <= tradeRanges[1] };
    }

    case 'heisman_finalist_drafted': {
      // Was any non-winner Heisman finalist drafted in round 1?
      const nonWinners = HEISMAN_FINALISTS_2025.filter(h => !h.isWinner);
      const draftedFinalist = nonWinners.some(h =>
        picks.some(p => playerNamesMatch(p.playerName, h.name))
      );
      // Can resolve early if one was already drafted
      if (draftedFinalist) {
        return { resolved: true, isCorrect: answer === 'Yes' };
      }
      if (picks.length >= 32) {
        return { resolved: true, isCorrect: answer === 'No' };
      }
      return null;
    }

    case 'heisman_winner_pick': {
      // What pick range will the Heisman winner go in?
      const winner = HEISMAN_FINALISTS_2025.find(h => h.isWinner);
      if (!winner) return null;
      const winnerPick = picks.find(p => playerNamesMatch(p.playerName, winner.name));
      if (!winnerPick) {
        if (picks.length >= 32) {
          return { resolved: true, isCorrect: answer.includes('Not in Round 1') || answer.includes('Undrafted') };
        }
        return null;
      }
      const hRanges = parseRange(answer);
      if (!hRanges) return { resolved: true, isCorrect: false };
      return { resolved: true, isCorrect: winnerPick.pickNumber >= hRanges[0] && winnerPick.pickNumber <= hRanges[1] };
    }

    case 'manual': {
      // Commissioner resolves manually via correct_answer field
      if (question.correctAnswer) {
        return { resolved: true, isCorrect: answer === question.correctAnswer };
      }
      return null;
    }

    default:
      return null;
  }
}

function parseRange(rangeStr: string): [number, number] | null {
  if (rangeStr.includes('Not in Round 1') || rangeStr.includes('11+')) {
    if (rangeStr.includes('11+')) return [11, 999];
    return null;
  }
  const match = rangeStr.match(/(\d+)-(\d+)/);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2])];
}

export async function scoreAllEntries(year: number) {
  const allPicks = await db.select().from(draftPicks).where(eq(draftPicks.year, year)).all();
  const allQuestions = await db.select().from(propQuestions).where(eq(propQuestions.year, year)).all();
  // Only score SUBMITTED entries — unsaved drafts aren't ranked on the board
  const allEntries = (await db.select().from(entries).where(eq(entries.year, year)).all())
    .filter(e => e.submittedAt);

  const pickData: DraftPick[] = allPicks.map(p => ({
    pickNumber: p.pickNumber,
    playerName: p.playerName,
    position: p.position,
    college: p.college,
    conference: p.conference,
    isTrade: p.isTrade ?? false,
    originalTeam: p.originalTeam || '',
  }));

  for (const entry of allEntries) {
    const userPicks = entry.picks as Record<string, unknown>;

    for (const question of allQuestions) {
      const userAnswer = userPicks[question.id];
      const result = resolveQuestion(question, pickData, userAnswer);

      if (result && result.resolved) {
        // Calculate points
        let pointsEarned = 0;
        if (result.isCorrect) {
          pointsEarned = question.points;
        }

        // Special: ordering partial credit
        if (question.questionType === 'ordering' && !result.isCorrect && userAnswer) {
          const rule = question.scoringRule as Record<string, unknown>;
          if (rule.partialCredit) {
            // Check if exactly 2 correct
            const players = rule.players as string[];
            const playerPicksList: { name: string; pickNumber: number }[] = [];
            for (const p of players) {
              const pick = pickData.find(pk => playerNamesMatch(pk.playerName, p));
              if (pick) playerPicksList.push({ name: p, pickNumber: pick.pickNumber });
            }
            if (playerPicksList.length === players.length) {
              const correctOrder = [...playerPicksList].sort((a, b) => a.pickNumber - b.pickNumber).map(p => p.name);
              const userOrder = JSON.parse(String(userAnswer)) as string[];
              let correctCount = 0;
              for (let i = 0; i < correctOrder.length; i++) {
                if (correctOrder[i] === userOrder[i]) correctCount++;
              }
              if (correctCount === 2) {
                pointsEarned = rule.partialCredit as number;
              }
            }
          }
        }

        // Upsert score
        const existingScore = (await client.execute({
          sql: 'SELECT id FROM scores WHERE entry_id = ? AND question_id = ?',
          args: [entry.id, question.id],
        })).rows[0] as unknown as { id: string } | undefined;

        if (existingScore) {
          await client.execute({
            sql: 'UPDATE scores SET is_correct = ?, points_earned = ?, resolved_at = ? WHERE id = ?',
            args: [result.isCorrect ? 1 : 0, pointsEarned, new Date().toISOString(), existingScore.id],
          });
        } else {
          await client.execute({
            sql: 'INSERT INTO scores (id, entry_id, question_id, is_correct, points_earned, resolved_at) VALUES (?, ?, ?, ?, ?, ?)',
            args: [uuid(), entry.id, question.id, result.isCorrect ? 1 : 0, pointsEarned, new Date().toISOString()],
          });
        }
      }
    }
  }

  // Also score mock drafts
  await scoreAllMockDrafts(year);
}

export async function getLeaderboard(year: number) {
  // Get prop scores per ENTRY (multi-entry users appear as multiple rows).
  // Only count submitted entries.
  const propResults = (await client.execute({
    sql: `
    SELECT
      e.id as entry_id,
      e.user_id,
      e.name as entry_name,
      u.display_name,
      COALESCE(SUM(s.points_earned), 0) as prop_points,
      COALESCE(SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END), 0) as correct_picks,
      COALESCE(SUM(CASE WHEN s.is_correct = 1 AND q.points = 3 THEN 1 ELSE 0 END), 0) as correct_3pt,
      COALESCE(SUM(CASE WHEN s.is_correct = 1 AND q.points = 2 THEN 1 ELSE 0 END), 0) as correct_2pt
    FROM entries e
    JOIN users u ON e.user_id = u.id
    LEFT JOIN scores s ON s.entry_id = e.id
    LEFT JOIN prop_questions q ON s.question_id = q.id
    WHERE e.year = ? AND e.submitted_at IS NOT NULL
    GROUP BY e.id, e.user_id, e.name, u.display_name
  `,
    args: [year],
  })).rows as Record<string, unknown>[];

  // Count entries per user to decide whether to disambiguate labels
  const entryCountByUser = new Map<string, number>();
  for (const r of propResults) {
    const uid = r.user_id as string;
    entryCountByUser.set(uid, (entryCountByUser.get(uid) || 0) + 1);
  }

  // Get mock scores (one per user, labelled with user display name only)
  const mockResults = await getMockLeaderboard(year);
  const mockMap = new Map(mockResults.map(m => [m.userId, m]));
  const mockAttached = new Set<string>(); // mock userIds we've already paired

  // Build rows, one per entry. The user's mock-draft score is attached to
  // their FIRST entry (alphabetical by entry name) so it's only counted
  // once toward their total.
  type Row = {
    rowKey: string;
    userId: string;
    entryId: string | null;
    displayName: string;
    propPoints: number;
    mockPoints: number;
    totalPoints: number;
    correctPicks: number;
    correct3pt: number;
    correct2pt: number;
    exactMocks: number;
  };
  const rows: Row[] = [];

  // Sort propResults so the alphabetically-first entry per user is processed first
  const sortedProps = [...propResults].sort((a, b) => {
    const u = (a.user_id as string).localeCompare(b.user_id as string);
    if (u !== 0) return u;
    return (a.entry_name as string).localeCompare(b.entry_name as string);
  });

  for (const r of sortedProps) {
    const userId = r.user_id as string;
    const entryId = r.entry_id as string;
    const entryName = r.entry_name as string;
    const baseDisplay = r.display_name as string;
    const multiple = (entryCountByUser.get(userId) || 0) > 1;
    const display = multiple ? `${baseDisplay} — ${entryName}` : baseDisplay;

    // Attach mock score only to the first entry row for this user
    const mock = mockMap.get(userId);
    let mockPts = 0;
    let exactMocks = 0;
    if (mock && !mockAttached.has(userId)) {
      mockPts = mock.mockPoints;
      exactMocks = mock.exactMatches;
      mockAttached.add(userId);
    }

    const propPts = r.prop_points as number;
    rows.push({
      rowKey: entryId,
      userId,
      entryId,
      displayName: display,
      propPoints: propPts,
      mockPoints: mockPts,
      totalPoints: propPts + mockPts,
      correctPicks: r.correct_picks as number,
      correct3pt: r.correct_3pt as number,
      correct2pt: r.correct_2pt as number,
      exactMocks,
    });
  }

  // Add users who have a mock but no submitted prop entry
  for (const mock of mockResults) {
    if (!mockAttached.has(mock.userId)) {
      rows.push({
        rowKey: `mock-only-${mock.userId}`,
        userId: mock.userId,
        entryId: null,
        displayName: mock.displayName,
        propPoints: 0,
        mockPoints: mock.mockPoints,
        totalPoints: mock.mockPoints,
        correctPicks: 0,
        correct3pt: 0,
        correct2pt: 0,
        exactMocks: mock.exactMatches,
      });
    }
  }

  // Sort and rank
  const sorted = rows.sort((a, b) =>
    b.totalPoints - a.totalPoints ||
    b.correct3pt - a.correct3pt ||
    b.exactMocks - a.exactMocks ||
    b.correct2pt - a.correct2pt ||
    a.displayName.localeCompare(b.displayName)
  );

  return sorted.map((r, index) => ({
    rank: index + 1,
    userId: r.userId,
    entryId: r.entryId,
    displayName: r.displayName,
    totalPoints: r.totalPoints,
    propPoints: r.propPoints,
    mockPoints: r.mockPoints,
    correctPicks: r.correctPicks,
    exactMocks: r.exactMocks,
  }));
}
