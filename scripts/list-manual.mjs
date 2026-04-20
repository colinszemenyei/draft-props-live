// List all questions still using the `manual` scoring rule — these won't
// auto-infer from the mock or auto-score on draft night.
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const result = await client.execute({
  sql: `SELECT id, question_text, scoring_rule, answer_options FROM prop_questions
        WHERE year = 2026 ORDER BY sort_order`,
});

for (const row of result.rows) {
  let rule;
  try { rule = JSON.parse(row.scoring_rule); } catch { rule = { type: 'invalid' }; }
  if (rule.type === 'manual') {
    console.log(`\n[MANUAL] "${row.question_text}"`);
    console.log(`  options: ${row.answer_options}`);
    console.log(`  id: ${row.id}`);
  }
}
