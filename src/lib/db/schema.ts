import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const draftYears = sqliteTable('draft_years', {
  year: integer('year').primaryKey(),
  lockTime: text('lock_time').notNull(), // ISO datetime
  status: text('status', { enum: ['setup', 'open', 'locked', 'live', 'complete'] }).notNull().default('setup'),
  mockScoringConfig: text('mock_scoring_config', { mode: 'json' }).$type<MockScoringConfig>().default({
    tiers: [
      { label: 'Picks 1-5', pickStart: 1, pickEnd: 5, exactPick: 3, within1: 1, within2: 0 },
      { label: 'Picks 6-15', pickStart: 6, pickEnd: 15, exactPick: 5, within1: 2, within2: 1 },
      { label: 'Picks 16-25', pickStart: 16, pickEnd: 25, exactPick: 7, within1: 3, within2: 1 },
      { label: 'Picks 26-32', pickStart: 26, pickEnd: 32, exactPick: 10, within1: 5, within2: 2 },
    ],
    lateRoundBonus: { enabled: true, threshold: 20, points: 2 },
  } as MockScoringConfig),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export interface MockScoringTier {
  label: string;        // e.g. "Top 5 Picks"
  pickStart: number;    // e.g. 1
  pickEnd: number;      // e.g. 5
  exactPick: number;    // Points for exact match in this range
  within1: number;      // Points if within 1 slot
  within2: number;      // Points if within 2 slots
}

export interface MockScoringConfig {
  tiers: MockScoringTier[];
  lateRoundBonus: {
    enabled: boolean;
    threshold: number;  // e.g. 20 — both mocked and actual pick >= this
    points: number;     // Points for late-round correct player
  };
}

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const propQuestions = sqliteTable('prop_questions', {
  id: text('id').primaryKey(),
  year: integer('year').notNull().references(() => draftYears.year),
  sortOrder: integer('sort_order').notNull().default(0),
  questionText: text('question_text').notNull(),
  questionType: text('question_type', {
    enum: ['multiple_choice', 'player_name', 'over_under', 'numeric', 'ordering', 'yes_no', 'pick_range']
  }).notNull(),
  answerOptions: text('answer_options', { mode: 'json' }).$type<string[]>(),
  correctAnswer: text('correct_answer'), // string or JSON
  points: integer('points').notNull().default(1),
  category: text('category'),
  scoringRule: text('scoring_rule', { mode: 'json' }).$type<Record<string, unknown>>(),
});

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  year: integer('year').notNull().references(() => draftYears.year),
  submittedAt: text('submitted_at'),
  picks: text('picks', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
});

export const draftPicks = sqliteTable('draft_picks', {
  id: text('id').primaryKey(),
  year: integer('year').notNull(),
  pickNumber: integer('pick_number').notNull(),
  team: text('team').notNull(),
  playerName: text('player_name').notNull(),
  position: text('position').notNull(),
  college: text('college').notNull(),
  conference: text('conference').notNull(),
  recordedAt: text('recorded_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const scores = sqliteTable('scores', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => entries.id),
  questionId: text('question_id').notNull().references(() => propQuestions.id),
  isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
  pointsEarned: integer('points_earned').notNull().default(0),
  resolvedAt: text('resolved_at').notNull().$defaultFn(() => new Date().toISOString()),
});
