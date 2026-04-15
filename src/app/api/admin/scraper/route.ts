import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getScraperStatus, pollDraftPicks, startPolling, stopPolling } from '@/lib/scraper';
import { initializeDatabase } from '@/lib/db/init';

export async function GET() {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(getScraperStatus());
}

export async function POST(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action, year } = await request.json();

  if (action === 'poll') {
    const result = await pollDraftPicks(year);
    return NextResponse.json(result);
  } else if (action === 'start') {
    startPolling(year);
    return NextResponse.json({ ok: true });
  } else if (action === 'stop') {
    stopPolling();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
