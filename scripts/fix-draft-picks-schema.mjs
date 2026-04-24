// EMERGENCY: add missing columns to draft_picks that the app's schema
// expects. Original migrate.ts CREATE TABLE had them but the prod DB
// pre-dates that, and CREATE TABLE IF NOT EXISTS doesn't alter.
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const cols = await client.execute({ sql: 'PRAGMA table_info(draft_picks)' });
const names = cols.rows.map(r => r.name);
console.log('Current columns:', names.join(', '));

if (!names.includes('is_trade')) {
  console.log('Adding is_trade...');
  await client.execute({
    sql: `ALTER TABLE draft_picks ADD COLUMN is_trade INTEGER NOT NULL DEFAULT 0`,
  });
  console.log('  ✓ added');
}
if (!names.includes('original_team')) {
  console.log('Adding original_team...');
  await client.execute({
    sql: `ALTER TABLE draft_picks ADD COLUMN original_team TEXT`,
  });
  console.log('  ✓ added');
}

const after = await client.execute({ sql: 'PRAGMA table_info(draft_picks)' });
console.log('\nAfter:', after.rows.map(r => r.name).join(', '));
