// One-shot fix: when the commissioner edits an Over/Under question's text
// (e.g. changes "2.5" to "1.5"), the admin UI doesn't update the underlying
// scoringRule JSON. This script re-parses the threshold from every Over/Under
// question text and updates the scoring_rule to match.
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/fix-qb-threshold.mjs

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
        WHERE year = 2026
          AND question_text LIKE '%Over/Under%'`,
});

let fixed = 0;
let inSync = 0;
let skipped = 0;

for (const row of result.rows) {
  let rule;
  try {
    rule = JSON.parse(row.scoring_rule);
  } catch {
    console.log(`SKIP (bad JSON): "${row.question_text}"`);
    skipped++;
    continue;
  }

  if (typeof rule.threshold !== 'number') {
    console.log(`SKIP (no threshold in rule): "${row.question_text}"`);
    skipped++;
    continue;
  }

  const match = row.question_text.match(/Over\/Under\s+(\d+(?:\.\d+)?)/i);
  if (!match) {
    console.log(`SKIP (no threshold in text): "${row.question_text}"`);
    skipped++;
    continue;
  }

  const textThreshold = parseFloat(match[1]);

  if (rule.threshold === textThreshold) {
    inSync++;
    continue;
  }

  console.log(`FIX: "${row.question_text}"`);
  console.log(`     rule ${rule.threshold} → ${textThreshold}`);
  rule.threshold = textThreshold;
  await client.execute({
    sql: 'UPDATE prop_questions SET scoring_rule = ? WHERE id = ?',
    args: [JSON.stringify(rule), row.id],
  });
  fixed++;
}

console.log(`\nFixed: ${fixed}  |  Already in sync: ${inSync}  |  Skipped: ${skipped}`);
