import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { entries, users, draftYears, scores, propQuestions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { client } from '@/lib/db';
import { initializeDatabase } from '@/lib/db/init';

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());

  // Check if locked (admins can always see)
  if (!session.isAdmin) {
    const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
    if (!draftYear) return NextResponse.json({ error: 'Year not found' }, { status: 404 });

    const now = new Date();
    const lockTime = new Date(draftYear.lockTime);
    if (now < lockTime && draftYear.status !== 'locked' && draftYear.status !== 'live' && draftYear.status !== 'complete') {
      return NextResponse.json({ error: 'Entries are not visible yet' }, { status: 403 });
    }
  }

  const allEntries = (await client.execute({
    sql: `
      SELECT e.*, u.display_name
      FROM entries e
      JOIN users u ON e.user_id = u.id
      WHERE e.year = ?
      ORDER BY u.display_name
    `,
    args: [year],
  })).rows as Array<Record<string, unknown>>;

  // Get scores for each entry
  const result = [];
  for (const entry of allEntries) {
    const entryScores = (await client.execute({
      sql: `
        SELECT s.*, q.question_text, q.points as max_points
        FROM scores s
        JOIN prop_questions q ON s.question_id = q.id
        WHERE s.entry_id = ?
      `,
      args: [entry.id as string],
    })).rows as Array<Record<string, unknown>>;

    result.push({
      id: entry.id,
      userId: entry.user_id,
      displayName: entry.display_name,
      year: entry.year,
      picks: typeof entry.picks === 'string' ? JSON.parse(entry.picks as string) : entry.picks,
      submittedAt: entry.submitted_at,
      scores: entryScores,
    });
  }

  return NextResponse.json(result);
}
