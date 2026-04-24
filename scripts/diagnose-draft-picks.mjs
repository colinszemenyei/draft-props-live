// Diagnostic: try the same draft_picks insert the scraper does, directly
// against Turso, and print the full error. Also prints table schema so
// we can see if columns match expectations.
import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log('\n== draft_picks schema ==');
const info = await client.execute({ sql: 'PRAGMA table_info(draft_picks)' });
for (const r of info.rows) {
  console.log(`  ${r.name}  ${r.type}  notnull=${r.notnull}  dflt=${r.dflt_value}  pk=${r.pk}`);
}

console.log('\n== existing picks for year 2026 ==');
const existing = await client.execute({ sql: 'SELECT pick_number, player_name FROM draft_picks WHERE year = ? ORDER BY pick_number', args: [2026] });
console.log(`  ${existing.rows.length} rows`);
for (const r of existing.rows) console.log(`  #${r.pick_number} ${r.player_name}`);

console.log('\n== indexes on draft_picks ==');
const idx = await client.execute({ sql: 'PRAGMA index_list(draft_picks)' });
for (const r of idx.rows) {
  console.log(`  ${r.name}  unique=${r.unique}  origin=${r.origin}`);
  const cols = await client.execute({ sql: `PRAGMA index_info(${r.name})` });
  for (const c of cols.rows) console.log(`    col: ${c.name}`);
}

console.log('\n== attempting test insert ==');
try {
  await client.execute({
    sql: `INSERT INTO draft_picks (id, year, pick_number, team, player_name, position, college, conference, is_trade, original_team, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      2026,
      99, // safe pick_number unlikely to collide
      'Test Team',
      'Test Player',
      'QB',
      'Test U',
      'Test Conf',
      0,
      'Test Team',
      new Date().toISOString(),
    ],
  });
  console.log('  ✓ Insert OK');
  // Clean up
  await client.execute({ sql: 'DELETE FROM draft_picks WHERE year = 2026 AND pick_number = 99' });
  console.log('  cleaned up test row');
} catch (err) {
  console.log('  ✗ Insert FAILED:');
  console.log('    code:', err.code);
  console.log('    message:', err.message);
  console.log('    cause:', err.cause);
  console.log('    full:', err);
}
