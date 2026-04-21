// One-shot migration: enable multiple entries per user per year.
// Steps:
//   1. ALTER TABLE entries ADD COLUMN name (default "Entry 1") if missing
//   2. Rebuild entries table without the UNIQUE(user_id, year) constraint
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-multi-entries.mjs

import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// 1. Check if `name` column already exists
const cols = await client.execute({ sql: "PRAGMA table_info(entries)" });
const colNames = cols.rows.map(r => r.name);
console.log('Current entries columns:', colNames.join(', '));

if (!colNames.includes('name')) {
  console.log("Adding `name` column...");
  await client.execute({
    sql: `ALTER TABLE entries ADD COLUMN name TEXT NOT NULL DEFAULT 'Entry 1'`,
  });
  console.log('  ✓ name column added');
} else {
  console.log('  name column already exists, skipping ADD');
}

// 2. Check for the UNIQUE constraint by looking at index_list
const indexes = await client.execute({ sql: "PRAGMA index_list(entries)" });
const uniqueIdx = indexes.rows.find(r => r.unique === 1 && String(r.origin) === 'u');
if (uniqueIdx) {
  console.log(`\nFound UNIQUE index: ${uniqueIdx.name} — rebuilding table to drop it...`);

  // Rebuild the table without the unique constraint
  await client.executeMultiple(`
    CREATE TABLE entries_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      year INTEGER NOT NULL REFERENCES draft_years(year),
      name TEXT NOT NULL DEFAULT 'Entry 1',
      submitted_at TEXT,
      picks TEXT NOT NULL DEFAULT '{}'
    );

    INSERT INTO entries_new (id, user_id, year, name, submitted_at, picks)
      SELECT id, user_id, year, COALESCE(name, 'Entry 1'), submitted_at, picks
      FROM entries;

    DROP TABLE entries;
    ALTER TABLE entries_new RENAME TO entries;
  `);
  console.log('  ✓ UNIQUE(user_id, year) constraint dropped');
} else {
  console.log('\nNo UNIQUE constraint on entries — nothing to drop');
}

// Verify
const entriesAfter = await client.execute({ sql: 'SELECT COUNT(*) as n FROM entries' });
console.log(`\nDone. entries row count: ${entriesAfter.rows[0].n}`);
