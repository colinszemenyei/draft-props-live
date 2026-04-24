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

  // Step 1: persist the pick. If this fails, return the error so the client
  // sees it. Use trade detection based on draft order.
  const { DRAFT_ORDER_2026 } = await import('@/lib/draft-order');
  const originalTeam = DRAFT_ORDER_2026.find(d => d.pick === body.pickNumber)?.team || '';
  const normalize = (t: string) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');
  const isTrade =
    !!originalTeam && !!body.team && normalize(originalTeam) !== normalize(body.team);

  try {
    await db.insert(draftPicks).values({
      id: uuid(),
      year: body.year,
      pickNumber: body.pickNumber,
      team: body.team,
      playerName: body.playerName,
      position: body.position,
      college,
      conference,
      isTrade,
      originalTeam,
    }).run();
  } catch (err) {
    console.error('draft pick insert failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Insert failed' },
      { status: 500 },
    );
  }

  // Step 2: fire-and-forget broadcast so the draft board updates live. Do
  // this BEFORE scoring because scoring is slower and sometimes throws —
  // we don't want a scoring bug to prevent the pick from appearing.
  try {
    broadcastEvent('new_pick', {
      pickNumber: body.pickNumber,
      team: body.team,
      playerName: body.playerName,
      position: body.position,
      college,
      conference,
      isTrade,
    });
  } catch (err) {
    console.error('broadcast new_pick failed:', err);
  }

  // Step 3: re-score and broadcast leaderboard. Best-effort — don't let a
  // scoring bug prevent the pick from being saved.
  try {
    await scoreAllEntries(body.year);
    const { getLeaderboard } = await import('@/lib/scoring/engine');
    broadcastEvent('score_update', { leaderboard: await getLeaderboard(body.year) });
  } catch (err) {
    console.error('scoring/broadcast failed:', err);
  }

  return NextResponse.json({ ok: true });
}
