import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log('=== Users ===');
const users = await client.execute({
  sql: 'SELECT id, display_name, is_admin, created_at FROM users ORDER BY created_at',
});
console.log(`Total users: ${users.rows.length}`);
for (const u of users.rows) {
  const admin = u.is_admin ? ' [admin]' : '';
  console.log(`  - ${u.display_name}${admin}  id=${u.id.slice(0, 8)}  created=${u.created_at}`);
}

console.log('\n=== Entries (all years) ===');
const entries = await client.execute({
  sql: `SELECT e.id, e.year, e.submitted_at, u.display_name, length(e.picks) as picks_len
        FROM entries e JOIN users u ON e.user_id = u.id
        ORDER BY e.year, u.display_name`,
});
console.log(`Total entries: ${entries.rows.length}`);
for (const r of entries.rows) {
  const status = r.submitted_at ? `SUBMITTED (${r.submitted_at})` : 'DRAFT';
  console.log(`  - ${r.display_name}  year=${r.year}  picks=${r.picks_len}b  ${status}`);
}

console.log('\n=== Mock Drafts (all years) ===');
const mocks = await client.execute({
  sql: `SELECT m.id, m.year, m.submitted_at, u.display_name, length(m.picks) as picks_len
        FROM mock_drafts m JOIN users u ON m.user_id = u.id
        ORDER BY m.year, u.display_name`,
});
console.log(`Total mocks: ${mocks.rows.length}`);
for (const r of mocks.rows) {
  const status = r.submitted_at ? `SUBMITTED (${r.submitted_at})` : 'DRAFT';
  console.log(`  - ${r.display_name}  year=${r.year}  picks=${r.picks_len}b  ${status}`);
}

console.log('\n=== Draft Years ===');
const years = await client.execute({ sql: 'SELECT * FROM draft_years' });
for (const y of years.rows) {
  console.log(`  - year=${y.year}  status=${y.status}  lock_time=${y.lock_time}`);
}
