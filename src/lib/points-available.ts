// Computes how many prop points an entry can still earn, given the current
// state of the draft. For each unresolved question, we check whether the
// user's answer is still mathematically possible to be correct. If yes,
// that question's points count toward "available."
//
// An entry's total prop points = earned + still-available + already-lost.

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  answerOptions: string[] | null;
  points: number;
  scoringRule: Record<string, unknown> | null;
}

interface DraftPickLite {
  pickNumber: number;
  playerName: string;
  position: string;
  college: string;
  conference: string;
  isTrade?: boolean;
}

interface EntryScore {
  question_id: string;
  is_correct: number;
  points_earned: number;
}

const DEFENSIVE_POSITIONS = ['EDGE', 'DT', 'LB', 'CB', 'S'];

function normalize(name: string): string {
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

function parseRange(rangeStr: string): [number, number] | null {
  if (rangeStr.includes('11+')) return [11, 999];
  if (rangeStr.includes('Not in')) return null;
  const match = rangeStr.match(/(\d+)-(\d+)/);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2])];
}

/**
 * Given a single question + the user's answer + current draft state, returns:
 *   true  — the user's answer could still be correct
 *   false — the user's answer has been ruled out (even if the prop isn't
 *           formally resolved yet)
 *   null  — can't determine, treat as still viable
 */
function isAnswerStillViable(
  question: Question,
  userAnswer: unknown,
  picks: DraftPickLite[],
  totalPicks = 32,
): boolean | null {
  if (userAnswer === undefined || userAnswer === null || userAnswer === '') return false;
  const rule = question.scoringRule as Record<string, unknown> | null;
  if (!rule) return null;
  const ruleType = rule.type as string;
  const answer = String(userAnswer);
  const pickedNames = new Set(picks.map(p => normalize(p.playerName)));
  const pickByNormalized = new Map(picks.map(p => [normalize(p.playerName), p]));
  const remaining = totalPicks - picks.length;
  const nextPickNum = picks.length < totalPicks ? picks.length + 1 : null;
  // ^^ Works because we assume picks come in order 1..32

  switch (ruleType) {
    case 'first_overall_pick': {
      const pick1 = picks.find(p => p.pickNumber === 1);
      if (!pick1) return true; // not yet resolved
      if (answer === 'Other') {
        const options = question.answerOptions || [];
        const matches = options.some(opt =>
          opt !== 'Other' && opt.toLowerCase().includes(pick1.playerName.toLowerCase()),
        );
        return !matches;
      }
      return answer.toLowerCase().includes(pick1.playerName.toLowerCase());
    }

    case 'specific_pick_player': {
      const pickNum = rule.pickNumber as number;
      const actual = picks.find(p => p.pickNumber === pickNum);
      if (!actual) return true;
      return normalize(actual.playerName) === normalize(answer);
    }

    case 'first_at_position': {
      const pos = rule.position as string;
      const first = picks
        .slice()
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .find(p => p.position === pos);
      if (!first) return true;
      if (answer === 'Other') {
        const options = question.answerOptions || [];
        return !options.some(opt =>
          opt !== 'Other' && opt.toLowerCase().includes(first.playerName.toLowerCase()),
        );
      }
      return answer.toLowerCase().includes(first.playerName.toLowerCase());
    }

    case 'first_at_position_group': {
      const positions = (rule.positions as string[]) || [];
      const first = picks
        .slice()
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .find(p => positions.includes(p.position));
      if (!first) return true;
      if (answer === 'Other') {
        const options = question.answerOptions || [];
        return !options.some(opt =>
          opt !== 'Other' && opt.toLowerCase().includes(first.playerName.toLowerCase()),
        );
      }
      return answer.toLowerCase().includes(first.playerName.toLowerCase());
    }

    case 'nth_at_position': {
      const pos = rule.position as string;
      const n = rule.n as number;
      const atPos = picks.filter(p => p.position === pos).sort((a, b) => a.pickNumber - b.pickNumber);
      const noOption = answer.includes('No ');
      if (atPos.length >= n) {
        const nth = atPos[n - 1];
        if (noOption) return false;
        if (answer === 'Other') {
          const options = question.answerOptions || [];
          return !options.some(opt =>
            opt !== 'Other' && !opt.includes('No ') && opt.toLowerCase().includes(nth.playerName.toLowerCase()),
          );
        }
        return answer.toLowerCase().includes(nth.playerName.toLowerCase());
      }
      // Not enough yet — "No Nth" is only right if draft ends without N at this position
      if (noOption) return picks.length < totalPicks; // still possible while room remains
      return true;
    }

    case 'position_count': {
      const pos = rule.position as string;
      const threshold = rule.threshold as number;
      const count = picks.filter(p => p.position === pos).length;
      if (count > threshold) return answer === 'Over';
      if (count + remaining < threshold) return answer === 'Under';
      return true; // still live — both sides possible
    }

    case 'conference_count': {
      const conf = rule.conference as string;
      const threshold = rule.threshold as number;
      const count = picks.filter(p => p.conference === conf).length;
      if (count > threshold) return answer === 'Over';
      if (count + remaining < threshold) return answer === 'Under';
      return true;
    }

    case 'state_count': {
      const colleges = ((rule.colleges as string[]) || []).map(c => c.toLowerCase());
      const threshold = rule.threshold as number;
      const count = picks.filter(p => colleges.includes(p.college.toLowerCase())).length;
      if (count > threshold) return answer === 'Over';
      if (count + remaining < threshold) return answer === 'Under';
      return true;
    }

    case 'defensive_top_n': {
      const n = rule.n as number;
      const threshold = rule.threshold as number;
      const topN = picks.filter(p => p.pickNumber <= n);
      const defCount = topN.filter(p => DEFENSIVE_POSITIONS.includes(p.position)).length;
      const remainingInTopN = Math.max(0, n - topN.length);
      if (topN.length >= n) return defCount > threshold ? answer === 'Over' : answer === 'Under';
      if (defCount > threshold) return answer === 'Over';
      if (defCount + remainingInTopN < threshold) return answer === 'Under';
      return true;
    }

    case 'player_pick_number': {
      const playerName = rule.playerName as string;
      const threshold = rule.threshold as number;
      const p = pickByNormalized.get(normalize(playerName));
      if (p) return p.pickNumber > threshold ? answer === 'Over' : answer === 'Under';
      // Not picked yet
      if (nextPickNum !== null && nextPickNum > threshold) return answer === 'Over';
      return true;
    }

    case 'player_pick_range': {
      const playerName = rule.playerName as string;
      const p = pickByNormalized.get(normalize(playerName));
      const userRange = parseRange(answer);
      if (p) {
        if (!userRange) return answer.includes('Not in') && false; // player was drafted
        return p.pickNumber >= userRange[0] && p.pickNumber <= userRange[1];
      }
      // Not yet picked
      if (picks.length >= totalPicks) return answer.includes('Not in Round 1') || answer.includes('11+');
      if (userRange && nextPickNum !== null && nextPickNum > userRange[1]) return false;
      return true;
    }

    case 'first_position_pick_range': {
      const pos = rule.position as string;
      const first = picks
        .slice()
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .find(p => p.position === pos);
      const userRange = parseRange(answer);
      if (first) {
        if (!userRange) return false;
        return first.pickNumber >= userRange[0] && first.pickNumber <= userRange[1];
      }
      // Not yet — range is still viable if we haven't passed its end
      if (userRange && nextPickNum !== null && nextPickNum > userRange[1]) return false;
      return true;
    }

    case 'conference_most_picks': {
      if (picks.length < totalPicks) return true; // can't tell yet
      const counts: Record<string, number> = {};
      picks.forEach(p => {
        counts[p.conference] = (counts[p.conference] || 0) + 1;
      });
      const max = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!max) return false;
      const namedConfs = ['SEC', 'Big Ten', 'ACC', 'Big 12'];
      if (answer === 'Other') return !namedConfs.includes(max[0]);
      return answer === max[0];
    }

    case 'ordering': {
      // Resolved when all named players are picked — partial credit allowed,
      // so always treat as viable until then.
      return true;
    }

    case 'trade_in_range': {
      const start = rule.pickStart as number;
      const end = rule.pickEnd as number;
      const inRange = picks.filter(p => p.pickNumber >= start && p.pickNumber <= end);
      const hasTrade = inRange.some(p => p.isTrade);
      if (hasTrade) return answer === 'Yes';
      if (inRange.length >= end - start + 1) return answer === 'No';
      return true;
    }

    case 'trade_count': {
      const threshold = rule.threshold as number;
      const count = picks.filter(p => p.isTrade).length;
      if (count > threshold) return answer === 'Over';
      if (count + remaining < threshold) return answer === 'Under';
      return true;
    }

    case 'trade_first_pick': {
      const tradePicks = picks.filter(p => p.isTrade).sort((a, b) => a.pickNumber - b.pickNumber);
      if (picks.length >= totalPicks && tradePicks.length === 0) {
        return answer.toLowerCase().includes('no trade') || answer.toLowerCase().includes('none');
      }
      if (tradePicks.length > 0) {
        const first = tradePicks[0];
        const userRange = parseRange(answer);
        if (!userRange) return false;
        return first.pickNumber >= userRange[0] && first.pickNumber <= userRange[1];
      }
      return true;
    }

    case 'heisman_finalist_drafted': {
      const finalists = ['Diego Pavia', 'Jeremiyah Love', 'Julian Sayin'];
      const drafted = finalists.some(f => pickedNames.has(normalize(f)));
      if (drafted) return answer === 'Yes';
      if (picks.length >= totalPicks) return answer === 'No';
      return true;
    }

    case 'heisman_winner_pick': {
      const winner = 'Fernando Mendoza';
      const p = pickByNormalized.get(normalize(winner));
      if (p) {
        const userRange = parseRange(answer);
        if (!userRange) return false;
        return p.pickNumber >= userRange[0] && p.pickNumber <= userRange[1];
      }
      if (picks.length >= totalPicks) {
        return answer.includes('Not in Round 1') || answer.includes('Undrafted');
      }
      return true;
    }

    case 'college_in_top_n': {
      const college = (rule.college as string).toLowerCase();
      const n = rule.topN as number;
      const hit = picks.some(p => p.pickNumber <= n && p.college.toLowerCase() === college);
      if (hit) return answer === 'Yes';
      const topNPicks = picks.filter(p => p.pickNumber <= n);
      if (topNPicks.length >= n) return answer === 'No';
      return true;
    }

    default:
      return null; // unknown rule — assume viable
  }
}

/**
 * For a single entry: sum of points remaining to earn, given their answers
 * and the current draft state.
 *
 * Excludes any question already scored in the entry's scores array (those
 * points are already banked or already lost).
 */
export function computePointsAvailable(
  questions: Question[],
  userPicks: Record<string, unknown>,
  entryScores: EntryScore[],
  draftPicks: DraftPickLite[],
): number {
  try {
    if (!Array.isArray(questions) || !Array.isArray(entryScores) || !Array.isArray(draftPicks)) return 0;
    const picksObj = userPicks && typeof userPicks === 'object' ? userPicks : {};
    const scoredQ = new Set(entryScores.map(s => s?.question_id).filter(Boolean));
    let available = 0;
    for (const q of questions) {
      if (!q || !q.id) continue;
      if (scoredQ.has(q.id)) continue;
      let viable: boolean | null = null;
      try {
        viable = isAnswerStillViable(q, picksObj[q.id], draftPicks);
      } catch {
        viable = null;
      }
      if (viable === false) continue;
      available += q.points || 0;
    }
    return available;
  } catch {
    return 0;
  }
}

/**
 * For each UNRESOLVED prop, returns the status-quo side — the side that
 * would win right now if nothing else changed. Projection only applies
 * to the status quo because if the other side has already occurred, the
 * prop is resolved and real points have been awarded by the scoring
 * engine (no projection needed).
 *
 * Count-based props: always return 'Under' while unresolved. The moment
 * the count crosses the threshold, the prop is resolved and the user's
 * real score reflects the Over win.
 *
 * Yes/No props: always return 'No' while unresolved. The moment the
 * event occurs (trade, finalist drafted, etc.), the prop is resolved.
 *
 * Returns null for prop types where there's no meaningful status quo
 * (specific_pick_player, first_at_position, ordering, etc.) so those
 * don't contribute to either current or projected totals until resolved.
 */
function currentLeaning(question: Question, picks: DraftPickLite[], totalPicks = 32): string | null {
  const rule = question.scoringRule as Record<string, unknown> | null;
  if (!rule) return null;
  const ruleType = rule.type as string;
  const remaining = totalPicks - picks.length;

  switch (ruleType) {
    // Count-based over/under. If we're here at all and the prop isn't
    // already resolved (scored), then by definition count ≤ threshold and
    // Under is the status quo.
    case 'position_count':
    case 'conference_count':
    case 'state_count':
    case 'trade_count': {
      const threshold = rule.threshold as number;
      if (typeof threshold !== 'number') return null;
      let count = 0;
      if (ruleType === 'position_count') {
        const pos = rule.position as string;
        count = picks.filter(p => p.position === pos).length;
      } else if (ruleType === 'conference_count') {
        const conf = rule.conference as string;
        count = picks.filter(p => p.conference === conf).length;
      } else if (ruleType === 'state_count') {
        const colleges = ((rule.colleges as string[]) || []).map(c => c.toLowerCase());
        count = picks.filter(p => colleges.includes(p.college.toLowerCase())).length;
      } else if (ruleType === 'trade_count') {
        count = picks.filter(p => p.isTrade).length;
      }
      // If count already exceeded threshold, the engine would have
      // resolved this prop as Over. If we're computing a projection,
      // it's because scores don't include this question yet — defensive
      // guard, don't project Over.
      if (count > threshold) return null;
      if (count + remaining < threshold) return null;
      return 'Under';
    }

    case 'defensive_top_n': {
      const n = rule.n as number;
      const threshold = rule.threshold as number;
      if (typeof n !== 'number' || typeof threshold !== 'number') return null;
      const topN = picks.filter(p => p.pickNumber <= n);
      const defCount = topN.filter(p => DEFENSIVE_POSITIONS.includes(p.position)).length;
      const remainingInTopN = Math.max(0, n - topN.length);
      if (defCount > threshold) return null;
      if (defCount + remainingInTopN < threshold) return null;
      return 'Under';
    }

    case 'player_pick_number': {
      // If we haven't passed the threshold and the player isn't drafted,
      // Under is the status quo (player could still go before threshold).
      // Once the player is drafted or the next pick number passes the
      // threshold, the engine resolves the prop and we shouldn't be
      // projecting it at all.
      const playerName = rule.playerName as string;
      const threshold = rule.threshold as number;
      if (!playerName || typeof threshold !== 'number') return null;
      const pickedNames = new Set(picks.map(p => normalize(p.playerName)));
      if (pickedNames.has(normalize(playerName))) return null;
      const nextPickNum = picks.length < totalPicks ? picks.length + 1 : totalPicks;
      if (nextPickNum > threshold) return null;
      return 'Under';
    }

    // Yes/No props — project toward "hasn't happened yet" while unresolved.
    case 'trade_in_range': {
      const start = rule.pickStart as number;
      const end = rule.pickEnd as number;
      if (typeof start !== 'number' || typeof end !== 'number') return null;
      const inRange = picks.filter(p => p.pickNumber >= start && p.pickNumber <= end);
      if (inRange.some(p => p.isTrade)) return null; // already Yes, resolved
      if (inRange.length >= end - start + 1) return null; // all in, No resolved
      return 'No';
    }
    case 'heisman_finalist_drafted': {
      const finalists = ['Diego Pavia', 'Jeremiyah Love', 'Julian Sayin'];
      const pickedNames = new Set(picks.map(p => normalize(p.playerName)));
      if (finalists.some(f => pickedNames.has(normalize(f)))) return null;
      if (picks.length >= totalPicks) return null;
      return 'No';
    }
    case 'college_in_top_n': {
      const college = (rule.college as string || '').toLowerCase();
      const n = rule.topN as number;
      if (!college || typeof n !== 'number') return null;
      const hit = picks.some(p => p.pickNumber <= n && p.college.toLowerCase() === college);
      if (hit) return null;
      const topNPicks = picks.filter(p => p.pickNumber <= n);
      if (topNPicks.length >= n) return null;
      return 'No';
    }

    default:
      return null;
  }
}

/**
 * Projected prop total if current leanings hold — earned points + any
 * unresolved questions where the user's answer matches the current leaning.
 *
 * Only applies to "leaning" props (over/under count-based, yes/no trade and
 * finalist props, etc.). Player-selection props without a leaning are
 * treated as still pending (not projected in or out).
 */
export function computeProjectedPropPoints(
  questions: Question[],
  userPicks: Record<string, unknown>,
  entryScores: EntryScore[],
  draftPicks: DraftPickLite[],
): number {
  try {
    if (!Array.isArray(entryScores)) entryScores = [];
    if (!Array.isArray(questions)) questions = [];
    if (!Array.isArray(draftPicks)) draftPicks = [];
    const picksObj = userPicks && typeof userPicks === 'object' ? userPicks : {};

    const scoredPoints = entryScores.reduce((s, sc) => s + (sc?.points_earned || 0), 0);
    const scoredQ = new Set(entryScores.map(s => s?.question_id).filter(Boolean));
    let projectedAdds = 0;

    for (const q of questions) {
      if (!q || !q.id) continue;
      if (scoredQ.has(q.id)) continue;
      const userAnswer = picksObj[q.id];
      if (userAnswer === undefined || userAnswer === null || userAnswer === '') continue;
      let leaning: string | null = null;
      try {
        leaning = currentLeaning(q, draftPicks);
      } catch {
        leaning = null;
      }
      if (leaning === null) continue;
      if (String(userAnswer) === leaning) projectedAdds += q.points || 0;
    }

    return scoredPoints + projectedAdds;
  } catch {
    // On any unexpected error, fall back to just the already-earned total
    return Array.isArray(entryScores)
      ? entryScores.reduce((s, sc) => s + (sc?.points_earned || 0), 0)
      : 0;
  }
}
