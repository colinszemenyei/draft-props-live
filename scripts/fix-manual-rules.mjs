// Wire up scoring rules for the four questions still using `manual`.
// Each fix was verified by eye against the question text + options.
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/fix-manual-rules.mjs

import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const fixes = [
  {
    id: '0546cebb-70b9-493b-a95e-6cfd45cb282e',
    label: 'Trade in first 5 picks',
    rule: { type: 'trade_in_range', pickStart: 1, pickEnd: 5 },
  },
  {
    id: 'dc652bca-2a33-4e06-b623-ee710b09d7d8',
    label: 'Total trades O/U 5.5',
    rule: { type: 'trade_count', threshold: 5.5 },
  },
  {
    id: 'fcb02ebd-32e1-4541-a36e-5cca57daa63a',
    label: 'Alabama player in top 20',
    rule: { type: 'college_in_top_n', college: 'Alabama', topN: 20 },
  },
  {
    id: 'c09526be-ec87-4379-bfe6-69c82e656210',
    label: 'KC Concepcion O/U 24.5',
    rule: { type: 'player_pick_number', playerName: 'KC Concepcion', threshold: 24.5 },
  },
];

for (const f of fixes) {
  await client.execute({
    sql: 'UPDATE prop_questions SET scoring_rule = ? WHERE id = ?',
    args: [JSON.stringify(f.rule), f.id],
  });
  console.log(`✓ ${f.label} → ${JSON.stringify(f.rule)}`);
}

console.log(`\nFixed ${fixes.length} questions.`);
