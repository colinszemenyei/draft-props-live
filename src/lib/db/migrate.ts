import { client } from './index';

export async function runMigrations() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS draft_years (
      year INTEGER PRIMARY KEY,
      lock_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'setup',
      mock_scoring_config TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prop_questions (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL REFERENCES draft_years(year),
      sort_order INTEGER NOT NULL DEFAULT 0,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL,
      answer_options TEXT,
      correct_answer TEXT,
      points INTEGER NOT NULL DEFAULT 1,
      category TEXT,
      scoring_rule TEXT
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      year INTEGER NOT NULL REFERENCES draft_years(year),
      name TEXT NOT NULL DEFAULT 'Entry 1',
      submitted_at TEXT,
      picks TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS draft_picks (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      pick_number INTEGER NOT NULL,
      team TEXT NOT NULL,
      player_name TEXT NOT NULL,
      position TEXT NOT NULL,
      college TEXT NOT NULL,
      conference TEXT NOT NULL,
      is_trade INTEGER NOT NULL DEFAULT 0,
      original_team TEXT,
      recorded_at TEXT NOT NULL,
      UNIQUE(year, pick_number)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES entries(id),
      question_id TEXT NOT NULL REFERENCES prop_questions(id),
      is_correct INTEGER NOT NULL,
      points_earned INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT NOT NULL,
      UNIQUE(entry_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mock_drafts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      year INTEGER NOT NULL REFERENCES draft_years(year),
      picks TEXT NOT NULL DEFAULT '{}',
      submitted_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, year)
    );

    CREATE TABLE IF NOT EXISTS mock_scores (
      id TEXT PRIMARY KEY,
      mock_draft_id TEXT NOT NULL REFERENCES mock_drafts(id),
      pick_number INTEGER NOT NULL,
      points_earned INTEGER NOT NULL DEFAULT 0,
      match_type TEXT NOT NULL DEFAULT 'none',
      resolved_at TEXT NOT NULL,
      UNIQUE(mock_draft_id, pick_number)
    );
  `);
}
