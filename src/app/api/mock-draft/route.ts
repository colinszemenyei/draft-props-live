import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { draftYears, entries } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { client } from '@/lib/db';
import { v4 as uuid } from 'uuid';
import { initializeDatabase } from '@/lib/db/init';

// Resolve the entry_id to operate on: explicit entryId param wins, otherwise
// fall back to the user's first entry for the year (creating one if needed).
type ResolveResult =
  | { ok: true; entryId: string }
  | { ok: false; error: string; status: number };

async function resolveEntryId(
  userId: string,
  year: number,
  explicitEntryId: string | null
): Promise<ResolveResult> {
  if (explicitEntryId) {
    const e = await db.select().from(entries).where(eq(entries.id, explicitEntryId)).get();
    if (!e) return { ok: false, error: 'Entry not found', status: 404 };
    if (e.userId !== userId) return { ok: false, error: 'Forbidden', status: 403 };
    return { ok: true, entryId: explicitEntryId };
  }

  // No explicit entry — find or create the user's first entry
  const existing = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.year, year)))
    .get();
  if (existing) return { ok: true, entryId: existing.id };

  const newId = uuid();
  await db.insert(entries).values({
    id: newId,
    userId,
    year,
    name: 'Entry 1',
    picks: {},
  }).run();
  return { ok: true, entryId: newId };
}

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(request.nextUrl.searchParams.get('year') || '2026');
  const entryId = request.nextUrl.searchParams.get('entryId');

  const resolved = await resolveEntryId(session.userId, year, entryId);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const mock = (await client.execute({
    sql: 'SELECT * FROM mock_drafts WHERE entry_id = ?',
    args: [resolved.entryId],
  })).rows[0] as Record<string, unknown> | undefined;

  if (!mock) return NextResponse.json(null);

  return NextResponse.json({
    id: mock.id,
    userId: mock.user_id,
    entryId: mock.entry_id,
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
  const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (!draftYear) return NextResponse.json({ error: 'Draft year not found' }, { status: 404 });

  const now = new Date();
  const lockTime = new Date(draftYear.lockTime);
  if (
    (now >= lockTime ||
      draftYear.status === 'locked' ||
      draftYear.status === 'live' ||
      draftYear.status === 'complete') &&
    !session.isAdmin
  ) {
    return NextResponse.json({ error: 'Entries are locked' }, { status: 403 });
  }

  const resolved = await resolveEntryId(session.userId, year, body.entryId || null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const entryId = resolved.entryId;

  const picksJson = JSON.stringify(body.picks || {});
  const existing = (await client.execute({
    sql: 'SELECT id FROM mock_drafts WHERE entry_id = ?',
    args: [entryId],
  })).rows[0] as unknown as { id: string } | undefined;

  if (existing) {
    await client.execute({
      sql: 'UPDATE mock_drafts SET picks = ?, submitted_at = ?, updated_at = ? WHERE id = ?',
      args: [
        picksJson,
        body.submitted ? new Date().toISOString() : null,
        new Date().toISOString(),
        existing.id,
      ],
    });
  } else {
    await client.execute({
      sql: `INSERT INTO mock_drafts (id, user_id, year, entry_id, picks, submitted_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuid(),
        session.userId,
        year,
        entryId,
        picksJson,
        body.submitted ? new Date().toISOString() : null,
        new Date().toISOString(),
      ],
    });
  }

  return NextResponse.json({ ok: true, entryId });
}

// Get all mock drafts (post-lock, for comparison)
export async function POST(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { year } = await request.json();

  // Check if locked (admins can always see)
  if (!session.isAdmin) {
    const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
    if (!draftYear) return NextResponse.json({ error: 'Year not found' }, { status: 404 });
    const now = new Date();
    const lockTime = new Date(draftYear.lockTime);
    if (
      now < lockTime &&
      draftYear.status !== 'locked' &&
      draftYear.status !== 'live' &&
      draftYear.status !== 'complete'
    ) {
      return NextResponse.json({ error: 'Not available yet' }, { status: 403 });
    }
  }

  const mocks = (await client.execute({
    sql: `
      SELECT m.*, u.display_name, e.name as entry_name
      FROM mock_drafts m
      JOIN users u ON m.user_id = u.id
      JOIN entries e ON m.entry_id = e.id
      WHERE m.year = ?
      ORDER BY u.display_name, e.name
    `,
    args: [year],
  })).rows as Array<Record<string, unknown>>;

  return NextResponse.json(
    mocks.map(m => ({
      id: m.id,
      userId: m.user_id,
      entryId: m.entry_id,
      displayName: m.display_name,
      entryName: m.entry_name,
      year: m.year,
      picks: typeof m.picks === 'string' ? JSON.parse(m.picks as string) : m.picks,
      submittedAt: m.submitted_at,
    }))
  );
}
