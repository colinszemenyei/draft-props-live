import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { draftPicks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { getConferenceForCollege, scoreAllEntries } from '@/lib/scoring/engine';
import { broadcastEvent } from '@/app/api/sse/draft/clients';
import { initializeDatabase } from '@/lib/db/init';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const conference = body.conference || getConferenceForCollege(body.college || '');

  await db.update(draftPicks)
    .set({
      team: body.team,
      playerName: body.playerName,
      position: body.position,
      college: body.college,
      conference,
    })
    .where(eq(draftPicks.id, id))
    .run();

  // Re-score
  const pick = await db.select().from(draftPicks).where(eq(draftPicks.id, id)).get();
  if (pick) {
    await scoreAllEntries(pick.year);
    const { getLeaderboard } = await import('@/lib/scoring/engine');
    broadcastEvent('score_update', { leaderboard: await getLeaderboard(pick.year) });
  }

  return NextResponse.json({ ok: true });
}
