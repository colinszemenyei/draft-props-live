import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { draftYears } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { sqlite } from '@/lib/db';
import { v4 as uuid } from 'uuid';
import { initializeDatabase } from '@/lib/db/init';

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(request.nextUrl.searchParams.get('year') || '2026');

  const mock = sqlite.prepare(
    'SELECT * FROM mock_drafts WHERE user_id = ? AND year = ?'
  ).get(session.userId, year) as Record<string, unknown> | undefined;

  if (!mock) return NextResponse.json(null);

  return NextResponse.json({
    id: mock.id,
    userId: mock.user_id,
    year: mock.year,
    picks: typeof mock.picks === 'string' ? JSON.parse(mock.picks as string) : mock.picks,
    submittedAt: mock.submitted_at,
  });
}

export async function PUT(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const year = body.year || 2026;

  // Check if locked
  const draftYear = db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (!draftYear) return NextResponse.json({ error: 'Draft year not found' }, { status: 404 });

  const now = new Date();
  const lockTime = new Date(draftYear.lockTime);
  if (now >= lockTime || draftYear.status === 'locked' || draftYear.status === 'live' || draftYear.status === 'complete') {
    return NextResponse.json({ error: 'Entries are locked' }, { status: 403 });
  }

  const picksJson = JSON.stringify(body.picks);
  const existing = sqlite.prepare(
    'SELECT id FROM mock_drafts WHERE user_id = ? AND year = ?'
  ).get(session.userId, year) as { id: string } | undefined;

  if (existing) {
    sqlite.prepare(
      'UPDATE mock_drafts SET picks = ?, submitted_at = ?, updated_at = ? WHERE id = ?'
    ).run(picksJson, body.submitted ? new Date().toISOString() : null, new Date().toISOString(), existing.id);
  } else {
    sqlite.prepare(
      'INSERT INTO mock_drafts (id, user_id, year, picks, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuid(), session.userId, year, picksJson, body.submitted ? new Date().toISOString() : null, new Date().toISOString());
  }

  return NextResponse.json({ ok: true });
}

// Get all mock drafts (post-lock, for comparison)
export async function POST(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { year } = await request.json();

  // Check if locked (admins can always see)
  if (!session.isAdmin) {
    const draftYear = db.select().from(draftYears).where(eq(draftYears.year, year)).get();
    if (!draftYear) return NextResponse.json({ error: 'Year not found' }, { status: 404 });
    const now = new Date();
    const lockTime = new Date(draftYear.lockTime);
    if (now < lockTime && draftYear.status !== 'locked' && draftYear.status !== 'live' && draftYear.status !== 'complete') {
      return NextResponse.json({ error: 'Not available yet' }, { status: 403 });
    }
  }

  const mocks = sqlite.prepare(`
    SELECT m.*, u.display_name
    FROM mock_drafts m
    JOIN users u ON m.user_id = u.id
    WHERE m.year = ?
    ORDER BY u.display_name
  `).all(year) as Array<Record<string, unknown>>;

  return NextResponse.json(mocks.map(m => ({
    id: m.id,
    userId: m.user_id,
    displayName: m.display_name,
    year: m.year,
    picks: typeof m.picks === 'string' ? JSON.parse(m.picks as string) : m.picks,
    submittedAt: m.submitted_at,
  })));
}
