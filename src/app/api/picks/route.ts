import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { entries, draftYears } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import { initializeDatabase } from '@/lib/db/init';

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());
  const entry = db.select().from(entries)
    .where(and(eq(entries.userId, session.userId), eq(entries.year, year)))
    .get();

  return NextResponse.json(entry || null);
}

export async function PUT(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const year = body.year || parseInt(process.env.DRAFT_YEAR || '2026');

  // Check if locked
  const draftYear = db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (!draftYear) return NextResponse.json({ error: 'Draft year not found' }, { status: 404 });

  const now = new Date();
  const lockTime = new Date(draftYear.lockTime);
  if (now >= lockTime || draftYear.status === 'locked' || draftYear.status === 'live' || draftYear.status === 'complete') {
    return NextResponse.json({ error: 'Entries are locked' }, { status: 403 });
  }

  // Upsert entry
  const existing = db.select().from(entries)
    .where(and(eq(entries.userId, session.userId), eq(entries.year, year)))
    .get();

  if (existing) {
    db.update(entries)
      .set({
        picks: body.picks,
        submittedAt: body.submitted ? new Date().toISOString() : existing.submittedAt,
      })
      .where(eq(entries.id, existing.id))
      .run();
  } else {
    db.insert(entries).values({
      id: uuid(),
      userId: session.userId,
      year,
      picks: body.picks,
      submittedAt: body.submitted ? new Date().toISOString() : null,
    }).run();
  }

  const entry = db.select().from(entries)
    .where(and(eq(entries.userId, session.userId), eq(entries.year, year)))
    .get();

  return NextResponse.json(entry);
}
