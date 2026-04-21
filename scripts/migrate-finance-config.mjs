// One-shot migration: add finance_config column to draft_years.
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const cols = await client.execute({ sql: 'PRAGMA table_info(draft_years)' });
const names = cols.rows.map(r => r.name);
console.log('draft_years columns:', names.join(', '));

if (names.includes('finance_config')) {
  console.log('  finance_config already exists');
} else {
  await client.execute({
    sql: `ALTER TABLE draft_years ADD COLUMN finance_config TEXT DEFAULT '{}'`,
  });
  console.log('  ✓ finance_config column added');
}
