import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { draftYears } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { startPolling, stopPolling } from '@/lib/scraper';
import { broadcastEvent } from '@/app/api/sse/draft/clients';
import { initializeDatabase } from '@/lib/db/init';

export async function GET() {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const years = await db.select().from(draftYears).orderBy(draftYears.year).all();
  return NextResponse.json(years);
}

export async function PUT(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const year = body.year;

  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  // Each field is optional so a partial PUT (e.g. just financeConfig) works
  if (body.lockTime !== undefined) updateData.lockTime = body.lockTime;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.mockScoringConfig !== undefined) updateData.mockScoringConfig = body.mockScoringConfig;
  if (body.financeConfig !== undefined) updateData.financeConfig = body.financeConfig;

  await db.update(draftYears)
    .set(updateData)
    .where(eq(draftYears.year, year))
    .run();

  // Start/stop polling based on status — only react if status was touched
  if (body.status !== undefined) {
    if (body.status === 'live') {
      startPolling(year);
    } else {
      stopPolling();
    }
    broadcastEvent('status_change', { year, status: body.status });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const year = body.year;

  const existing = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (existing) return NextResponse.json({ error: 'Year already exists' }, { status: 409 });

  await db.insert(draftYears).values({
    year,
    lockTime: body.lockTime || new Date(`${year}-04-24T19:50:00-04:00`).toISOString(),
    status: 'setup',
  }).run();

  return NextResponse.json({ ok: true });
}
