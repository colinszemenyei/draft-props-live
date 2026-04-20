// Fix player-pick over/under questions that were added via the admin panel
// and left with a `manual` scoring rule. Parses "<Player Name> Over/Under pick X.X"
// and rewrites the rule as player_pick_number.
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/fix-player-ou.mjs

import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const client = createClient({ url, ...(authToken ? { authToken } : {}) });

const result = await client.execute({
  sql: `SELECT id, question_text, scoring_rule FROM prop_questions
        WHERE year = 2026 AND question_text LIKE '%Over/Under pick%'`,
});

let fixed = 0;
for (const row of result.rows) {
  // Extract "<name>" before "Over/Under pick X.X"
  const match = row.question_text.match(/^(.+?)\s+Over\/Under\s+pick\s+(\d+(?:\.\d+)?)/i);
  if (!match) {
    console.log(`SKIP (no match): "${row.question_text}"`);
    continue;
  }

  const playerName = match[1].trim();
  const threshold = parseFloat(match[2]);
  const newRule = {
    type: 'player_pick_number',
    playerName,
    threshold,
  };

  console.log(`FIX: "${row.question_text}"`);
  console.log(`     → ${JSON.stringify(newRule)}`);
  await client.execute({
    sql: 'UPDATE prop_questions SET scoring_rule = ? WHERE id = ?',
    args: [JSON.stringify(newRule), row.id],
  });
  fixed++;
}

console.log(`\nFixed: ${fixed}`);
