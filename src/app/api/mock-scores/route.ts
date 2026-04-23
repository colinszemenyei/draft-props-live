import { NextRequest, NextResponse } from 'next/server';
import { db, client } from '@/lib/db';
import { draftYears } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

// Returns every submitted mock draft with its per-pick score breakdown, so
// the leaderboard's expanded-row view can render each player's mock board
// next to the actual picks.
//
// Gated post-lock (admins always). Mirrors /api/picks visibility.
export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(
    request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString()
  );

  const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (!draftYear) return NextResponse.json({ error: 'Year not found' }, { status: 404 });

  if (!session.isAdmin) {
    const now = new Date();
    const lockTime = new Date(draftYear.lockTime);
    const visible =
      now >= lockTime ||
      draftYear.status === 'locked' ||
      draftYear.status === 'live' ||
      draftYear.status === 'complete';
    if (!visible) return NextResponse.json({ error: 'Not available yet' }, { status: 403 });
  }

  const mocks = (await client.execute({
    sql: `
      SELECT m.id, m.user_id, m.entry_id, m.picks, u.display_name, e.name AS entry_name
      FROM mock_drafts m
      JOIN users u ON u.id = m.user_id
      JOIN entries e ON e.id = m.entry_id
      WHERE m.year = ? AND m.submitted_at IS NOT NULL
    `,
    args: [year],
  })).rows as unknown as Array<{
    id: string;
    user_id: string;
    entry_id: string;
    picks: string;
    display_name: string;
    entry_name: string;
  }>;

  if (mocks.length === 0) return NextResponse.json([]);

  const mockIds = mocks.map(m => m.id);
  const placeholders = mockIds.map(() => '?').join(',');
  const scoreRows = (await client.execute({
    sql: `SELECT mock_draft_id, pick_number, points_earned, match_type
          FROM mock_scores
          WHERE mock_draft_id IN (${placeholders})`,
    args: mockIds,
  })).rows as unknown as Array<{
    mock_draft_id: string;
    pick_number: number;
    points_earned: number;
    match_type: string;
  }>;

  // Bucket scores by mock id
  const scoresByMock = new Map<
    string,
    Array<{ pickNumber: number; pointsEarned: number; matchType: string }>
  >();
  for (const s of scoreRows) {
    const list = scoresByMock.get(s.mock_draft_id) || [];
    list.push({
      pickNumber: s.pick_number,
      pointsEarned: s.points_earned,
      matchType: s.match_type,
    });
    scoresByMock.set(s.mock_draft_id, list);
  }

  return NextResponse.json(
    mocks.map(m => ({
      id: m.id,
      userId: m.user_id,
      entryId: m.entry_id,
      displayName: m.display_name,
      entryName: m.entry_name,
      picks: typeof m.picks === 'string' ? JSON.parse(m.picks) : m.picks,
      scores: scoresByMock.get(m.id) || [],
    }))
  );
}
