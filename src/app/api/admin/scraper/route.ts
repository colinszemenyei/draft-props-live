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

  try {
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
  } catch (err) {
    // Surface the real error so the admin UI can show it instead of
    // failing silently.
    console.error(`scraper action '${action}' failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scraper action failed' },
      { status: 500 },
    );
  }
}
