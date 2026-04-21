// One-shot migration: tie each mock draft to a specific entry so that
// users with multiple prop entries can also have multiple mocks.
//
// Steps:
//   1. ALTER TABLE mock_drafts ADD COLUMN entry_id
//   2. Backfill entry_id for existing mocks by matching on (user_id, year)
//      - If user has an entry, point the mock at their first one
//      - If user has no entry, create a stub entry and attach to it
//   3. Rebuild mock_drafts to drop UNIQUE(user_id, year) and add
//      UNIQUE(entry_id)
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-mocks-per-entry.mjs

import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// 1. Check for entry_id column
const cols = await client.execute({ sql: 'PRAGMA table_info(mock_drafts)' });
const colNames = cols.rows.map(r => r.name);
console.log('mock_drafts columns:', colNames.join(', '));

if (!colNames.includes('entry_id')) {
  console.log('Adding entry_id column...');
  await client.execute({ sql: 'ALTER TABLE mock_drafts ADD COLUMN entry_id TEXT' });
  console.log('  ✓ entry_id column added');
} else {
  console.log('  entry_id already exists');
}

// 2. Backfill entry_id for any mocks that don't have one set
const unmapped = (await client.execute({
  sql: 'SELECT id, user_id, year FROM mock_drafts WHERE entry_id IS NULL',
})).rows;
console.log(`\n${unmapped.length} mocks need entry_id backfilled`);

for (const m of unmapped) {
  // Find the user's first entry for that year
  let entry = (await client.execute({
    sql: 'SELECT id FROM entries WHERE user_id = ? AND year = ? ORDER BY name LIMIT 1',
    args: [m.user_id, m.year],
  })).rows[0];

  if (!entry) {
    // Create a stub entry
    const entryId = randomUUID();
    await client.execute({
      sql: `INSERT INTO entries (id, user_id, year, name, picks)
            VALUES (?, ?, ?, 'Entry 1', '{}')`,
      args: [entryId, m.user_id, m.year],
    });
    console.log(`  created stub entry for user ${String(m.user_id).slice(0, 8)}...`);
    entry = { id: entryId };
  }

  await client.execute({
    sql: 'UPDATE mock_drafts SET entry_id = ? WHERE id = ?',
    args: [entry.id, m.id],
  });
  console.log(`  mock ${String(m.id).slice(0, 8)} → entry ${String(entry.id).slice(0, 8)}`);
}

// 3. Rebuild mock_drafts to change constraints
const indexes = await client.execute({ sql: 'PRAGMA index_list(mock_drafts)' });
const hasOldUnique = indexes.rows.some(
  r => r.unique === 1 && String(r.origin) === 'u' && !String(r.name).includes('entry')
);
const hasEntryUnique = indexes.rows.some(
  r => r.unique === 1 && String(r.name).includes('entry')
);

if (hasOldUnique || !hasEntryUnique) {
  console.log('\nRebuilding mock_drafts table with new constraints...');
  await client.executeMultiple(`
    CREATE TABLE mock_drafts_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      year INTEGER NOT NULL REFERENCES draft_years(year),
      entry_id TEXT NOT NULL REFERENCES entries(id),
      picks TEXT NOT NULL DEFAULT '{}',
      submitted_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(entry_id)
    );

    INSERT INTO mock_drafts_new (id, user_id, year, entry_id, picks, submitted_at, updated_at)
      SELECT id, user_id, year, entry_id, picks, submitted_at, updated_at
      FROM mock_drafts;

    DROP TABLE mock_drafts;
    ALTER TABLE mock_drafts_new RENAME TO mock_drafts;
  `);
  console.log('  ✓ mock_drafts rebuilt with UNIQUE(entry_id)');
} else {
  console.log('\nmock_drafts constraints already correct');
}

const finalCount = await client.execute({ sql: 'SELECT COUNT(*) as n FROM mock_drafts' });
console.log(`\nDone. mock_drafts row count: ${finalCount.rows[0].n}`);
