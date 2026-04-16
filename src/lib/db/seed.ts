import { db } from './index';
import { propQuestions } from './schema';
import { v4 as uuid } from 'uuid';

export async function seedStarterQuestions(year: number) {
  const questions = [
    // Position Props
    {
      questionText: 'Who will be the 1st overall pick?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['Fernando Mendoza (Indiana, QB)', 'Arvell Reese (Ohio State, EDGE)', 'David Bailey (Texas Tech, EDGE)', 'Other'],
      points: 1,
      category: 'Position',
      scoringRule: { type: 'first_overall_pick' },
    },
    {
      questionText: 'Who will be the 2nd Quarterback selected in Round 1?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['Ty Simpson (Alabama)', 'Drew Allar (Penn State)', 'Other', 'No 2nd QB in Round 1'],
      points: 2,
      category: 'Position',
      scoringRule: { type: 'nth_at_position', position: 'QB', n: 2 },
    },
    {
      questionText: 'Who will be the 1st Wide Receiver selected?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['Carnell Tate (Ohio State)', 'Jordyn Tyson (Arizona State)', 'Makai Lemon (USC)', 'Other'],
      points: 2,
      category: 'Position',
      scoringRule: { type: 'first_at_position', position: 'WR' },
    },
    {
      questionText: 'Who will be the 1st Cornerback selected?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['Mansoor Delane (LSU)', 'Jermod McCoy (Tennessee)', 'Avieon Terrell (Clemson)', 'Other'],
      points: 2,
      category: 'Position',
      scoringRule: { type: 'first_at_position', position: 'CB' },
    },
    {
      questionText: 'Who will be the 1st Running Back selected?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['Jeremiyah Love (Notre Dame)', 'Other'],
      points: 2,
      category: 'Position',
      scoringRule: { type: 'first_at_position', position: 'RB' },
    },
    {
      questionText: 'Who will be the 1st Offensive Lineman selected?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['Monroe Freeling (Georgia)', 'Francis Mauigoa (Miami)', 'Spencer Fano (Utah)', 'Other'],
      points: 2,
      category: 'Position',
      scoringRule: { type: 'first_at_position_group', positions: ['OT', 'IOL', 'G', 'C', 'OL'] },
    },
    {
      questionText: 'Who will be the 1st Tight End selected?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['Kenyon Sadiq (Oregon)', 'Eli Stowers (Vanderbilt)', 'Other'],
      points: 2,
      category: 'Position',
      scoringRule: { type: 'first_at_position', position: 'TE' },
    },
    // Over/Under Props
    {
      questionText: 'Total Quarterbacks selected in Round 1: Over/Under 2.5',
      questionType: 'over_under' as const,
      answerOptions: ['Over', 'Under'],
      points: 1,
      category: 'Over/Under',
      scoringRule: { type: 'position_count', position: 'QB', threshold: 2.5 },
    },
    {
      questionText: 'Total Wide Receivers selected in Round 1: Over/Under 5.5',
      questionType: 'over_under' as const,
      answerOptions: ['Over', 'Under'],
      points: 1,
      category: 'Over/Under',
      scoringRule: { type: 'position_count', position: 'WR', threshold: 5.5 },
    },
    {
      questionText: 'Total Defensive players selected in the Top 10: Over/Under 4.5',
      questionType: 'over_under' as const,
      answerOptions: ['Over', 'Under'],
      points: 1,
      category: 'Over/Under',
      scoringRule: { type: 'defensive_top_n', n: 10, threshold: 4.5 },
    },
    {
      questionText: "Fernando Mendoza's draft position: Over/Under 1.5",
      questionType: 'over_under' as const,
      answerOptions: ['Over', 'Under'],
      points: 1,
      category: 'Over/Under',
      scoringRule: { type: 'player_pick_number', playerName: 'Fernando Mendoza', threshold: 1.5 },
    },
    {
      questionText: 'Total SEC players selected in Round 1: Over/Under 8.5',
      questionType: 'over_under' as const,
      answerOptions: ['Over', 'Under'],
      points: 1,
      category: 'Over/Under',
      scoringRule: { type: 'conference_count', conference: 'SEC', threshold: 8.5 },
    },
    {
      questionText: 'Total Big Ten players selected in Round 1: Over/Under 7.5',
      questionType: 'over_under' as const,
      answerOptions: ['Over', 'Under'],
      points: 1,
      category: 'Over/Under',
      scoringRule: { type: 'conference_count', conference: 'Big Ten', threshold: 7.5 },
    },
    // Specific Prediction Props
    {
      questionText: 'What pick number will David Bailey (Texas Tech, EDGE) be selected?',
      questionType: 'pick_range' as const,
      answerOptions: ['2-3', '4-5', '6-10', '11+/Not in Round 1'],
      points: 2,
      category: 'Specific Prediction',
      scoringRule: { type: 'player_pick_range', playerName: 'David Bailey' },
    },
    {
      questionText: 'What pick number will the 1st Wide Receiver be selected?',
      questionType: 'pick_range' as const,
      answerOptions: ['1-5', '6-10', '11-16', '17-24', '25-32'],
      points: 1,
      category: 'Specific Prediction',
      scoringRule: { type: 'first_position_pick_range', position: 'WR' },
    },
    {
      questionText: 'Name the player selected with the 2nd overall pick (by the Jets)',
      questionType: 'player_name' as const,
      answerOptions: null,
      points: 3,
      category: 'Specific Prediction',
      scoringRule: { type: 'specific_pick_player', pickNumber: 2 },
    },
    {
      questionText: 'Name the player selected with the 10th overall pick',
      questionType: 'player_name' as const,
      answerOptions: null,
      points: 3,
      category: 'Specific Prediction',
      scoringRule: { type: 'specific_pick_player', pickNumber: 10 },
    },
    // Wild Card / Fun Props
    {
      questionText: 'Will a trade occur within the first 5 picks?',
      questionType: 'yes_no' as const,
      answerOptions: ['Yes', 'No'],
      points: 1,
      category: 'Wild Card',
      scoringRule: { type: 'trade_in_range', pickStart: 1, pickEnd: 5 },
    },
    {
      questionText: 'Which conference will produce the most Round 1 picks?',
      questionType: 'multiple_choice' as const,
      answerOptions: ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Other'],
      points: 2,
      category: 'Wild Card',
      scoringRule: { type: 'conference_most_picks' },
    },
    {
      questionText: 'Rank these 4 prospects by draft position, earliest first:',
      questionType: 'ordering' as const,
      answerOptions: ['Carnell Tate', 'Mansoor Delane', 'Reuben Bain Jr.', 'Kenyon Sadiq'],
      points: 3,
      category: 'Wild Card',
      scoringRule: { type: 'ordering', players: ['Carnell Tate', 'Mansoor Delane', 'Reuben Bain Jr.', 'Kenyon Sadiq'], partialCredit: 1 },
    },
    {
      questionText: 'Total picks from the state of Ohio (Ohio State, Cincinnati, etc.) in Round 1: Over/Under 3.5',
      questionType: 'over_under' as const,
      answerOptions: ['Over', 'Under'],
      points: 1,
      category: 'Wild Card',
      scoringRule: { type: 'state_count', state: 'Ohio', colleges: ['Ohio State', 'Cincinnati', 'Bowling Green', 'Kent State', 'Akron', 'Ohio', 'Miami (OH)', 'Toledo'], threshold: 3.5 },
    },
    {
      questionText: 'Will any Heisman Trophy finalist other than Mendoza be selected in Round 1?',
      questionType: 'yes_no' as const,
      answerOptions: ['Yes', 'No'],
      points: 1,
      category: 'Wild Card',
      scoringRule: { type: 'heisman_finalist_drafted' },
    },
  ];

  for (let index = 0; index < questions.length; index++) {
    const q = questions[index];
    await db.insert(propQuestions).values({
      id: uuid(),
      year,
      sortOrder: index + 1,
      questionText: q.questionText,
      questionType: q.questionType,
      answerOptions: q.answerOptions as string[],
      points: q.points,
      category: q.category,
      scoringRule: q.scoringRule as Record<string, unknown>,
    }).run();
  }
}
