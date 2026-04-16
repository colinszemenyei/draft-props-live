import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { draftPicks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import { getConferenceForCollege, scoreAllEntries } from '@/lib/scoring/engine';
import { broadcastEvent } from '@/app/api/sse/draft/clients';
import { initializeDatabase } from '@/lib/db/init';

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());
  const picks = await db.select().from(draftPicks)
    .where(eq(draftPicks.year, year))
    .orderBy(draftPicks.pickNumber)
    .all();

  return NextResponse.json(picks);
}

export async function POST(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const college = body.college || '';
  const conference = body.conference || getConferenceForCollege(college);

  await db.insert(draftPicks).values({
    id: uuid(),
    year: body.year,
    pickNumber: body.pickNumber,
    team: body.team,
    playerName: body.playerName,
    position: body.position,
    college,
    conference,
  }).run();

  // Re-score and broadcast
  await scoreAllEntries(body.year);

  broadcastEvent('new_pick', {
    pickNumber: body.pickNumber,
    team: body.team,
    playerName: body.playerName,
    position: body.position,
    college,
    conference,
  });

  const { getLeaderboard } = await import('@/lib/scoring/engine');
  broadcastEvent('score_update', { leaderboard: await getLeaderboard(body.year) });

  return NextResponse.json({ ok: true });
}
