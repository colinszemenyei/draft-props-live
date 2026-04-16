import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { scoreAllEntries, getLeaderboard } from '@/lib/scoring/engine';
import { broadcastEvent } from '@/app/api/sse/draft/clients';
import { initializeDatabase } from '@/lib/db/init';

export async function POST(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { year } = await request.json();
  await scoreAllEntries(year);
  broadcastEvent('score_update', { leaderboard: await getLeaderboard(year) });

  return NextResponse.json({ ok: true, leaderboard: await getLeaderboard(year) });
}
