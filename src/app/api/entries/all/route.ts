import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { db } from '@/lib/db';
import { draftYears } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

// Returns all entries for a year with display names and scores, so the
// /entries comparison grid can render everyone's picks side-by-side.
// Gated: only available after the draft locks (or to the commissioner).
export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(
    request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString()
  );

  const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (!draftYear) return NextResponse.json({ error: 'Draft year not found' }, { status: 404 });

  const now = new Date();
  const lockTime = new Date(draftYear.lockTime);
  const isLocked =
    now >= lockTime ||
    draftYear.status === 'locked' ||
    draftYear.status === 'live' ||
    draftYear.status === 'complete';

  if (!isLocked && !session.isAdmin) {
    return NextResponse.json(
      { error: 'Entries are visible after the lock time' },
      { status: 403 }
    );
  }

  const entryRows = (await client.execute({
    sql: `SELECT e.id, e.picks, u.display_name
          FROM entries e
          JOIN users u ON e.user_id = u.id
          WHERE e.year = ? AND e.submitted_at IS NOT NULL
          ORDER BY u.display_name`,
    args: [year],
  })).rows as unknown as { id: string; picks: string; display_name: string }[];

  if (entryRows.length === 0) return NextResponse.json([]);

  const entryIds = entryRows.map(r => r.id);
  const placeholders = entryIds.map(() => '?').join(',');
  const scoreRows = (await client.execute({
    sql: `SELECT entry_id, question_id, is_correct, points_earned
          FROM scores
          WHERE entry_id IN (${placeholders})`,
    args: entryIds,
  })).rows as unknown as {
    entry_id: string;
    question_id: string;
    is_correct: number;
    points_earned: number;
  }[];

  const scoresByEntry = new Map<
    string,
    Array<{ question_id: string; is_correct: number; points_earned: number }>
  >();
  for (const s of scoreRows) {
    const list = scoresByEntry.get(s.entry_id) || [];
    list.push({
      question_id: s.question_id,
      is_correct: s.is_correct,
      points_earned: s.points_earned,
    });
    scoresByEntry.set(s.entry_id, list);
  }

  const result = entryRows.map(r => ({
    id: r.id,
    displayName: r.display_name,
    picks: typeof r.picks === 'string' ? JSON.parse(r.picks) : r.picks,
    scores: scoresByEntry.get(r.id) || [],
  }));

  return NextResponse.json(result);
}
