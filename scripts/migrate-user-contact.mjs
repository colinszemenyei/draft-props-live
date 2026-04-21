// One-shot migration: add `contact` column to users table so we can
// collect email/phone for payment tracking.
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-user-contact.mjs

import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const cols = await client.execute({ sql: 'PRAGMA table_info(users)' });
const colNames = cols.rows.map(r => r.name);
console.log('users columns:', colNames.join(', '));

if (colNames.includes('contact')) {
  console.log('  contact column already exists — skipping');
} else {
  await client.execute({ sql: 'ALTER TABLE users ADD COLUMN contact TEXT' });
  console.log('  ✓ contact column added');
}

// Show who's missing contact so Zach knows who to chase
const missing = await client.execute({
  sql: "SELECT display_name FROM users WHERE contact IS NULL OR contact = '' ORDER BY created_at",
});
console.log(`\n${missing.rows.length} user(s) missing contact info:`);
for (const u of missing.rows) {
  console.log(`  - ${u.display_name}`);
}
