import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { draftYears } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { getLeaderboard } from '@/lib/scoring/engine';
import { initializeDatabase } from '@/lib/db/init';

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());

  // Check if locked
  if (!session.isAdmin) {
    const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
    if (!draftYear) return NextResponse.json({ error: 'Year not found' }, { status: 404 });

    const now = new Date();
    const lockTime = new Date(draftYear.lockTime);
    if (now < lockTime && draftYear.status !== 'locked' && draftYear.status !== 'live' && draftYear.status !== 'complete') {
      return NextResponse.json({ error: 'Leaderboard not available yet' }, { status: 403 });
    }
  }

  return NextResponse.json(await getLeaderboard(year));
}
