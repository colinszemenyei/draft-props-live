import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { entries, draftYears } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import { initializeDatabase } from '@/lib/db/init';

// GET:
//   - without entryId → list of the current user's entries for the year
//     (backwards-compat: if the user has no entries, returns null; if they
//      have exactly one and no `list=1` flag, returns that single entry)
//   - with entryId → that specific entry (must be owner or admin)
export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(
    request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString()
  );
  const entryId = request.nextUrl.searchParams.get('entryId');
  const list = request.nextUrl.searchParams.get('list') === '1';

  if (entryId) {
    const entry = await db.select().from(entries).where(eq(entries.id, entryId)).get();
    if (!entry) return NextResponse.json(null);
    if (entry.userId !== session.userId && !session.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(entry);
  }

  const userEntries = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, session.userId), eq(entries.year, year)))
    .all();

  // Sort by created order (id is UUID, so use submitted_at then name as a proxy)
  userEntries.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (list) return NextResponse.json(userEntries);

  // Back-compat behavior for callers that still expect a single entry:
  if (userEntries.length === 0) return NextResponse.json(null);
  return NextResponse.json(userEntries[0]);
}

// PUT:
//   - with entryId → update that entry (must be owner)
//   - without entryId → create a new entry for the current user
//   - body may include `name` to rename
export async function PUT(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const year = body.year || parseInt(process.env.DRAFT_YEAR || '2026');
  const entryId: string | undefined = body.entryId;

  const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (!draftYear) return NextResponse.json({ error: 'Draft year not found' }, { status: 404 });

  const now = new Date();
  const lockTime = new Date(draftYear.lockTime);
  const isLocked =
    now >= lockTime ||
    draftYear.status === 'locked' ||
    draftYear.status === 'live' ||
    draftYear.status === 'complete';

  if (isLocked && !session.isAdmin) {
    return NextResponse.json({ error: 'Entries are locked' }, { status: 403 });
  }

  if (entryId) {
    // Update existing
    const existing = await db.select().from(entries).where(eq(entries.id, entryId)).get();
    if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (existing.userId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (body.picks !== undefined) updates.picks = body.picks;
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 40);
    if (body.submitted === true) updates.submittedAt = new Date().toISOString();
    if (body.submitted === false) {
      // Don't clear submittedAt on auto-save; leave whatever was there
    }

    if (Object.keys(updates).length > 0) {
      await db.update(entries).set(updates).where(eq(entries.id, entryId)).run();
    }

    const updated = await db.select().from(entries).where(eq(entries.id, entryId)).get();
    return NextResponse.json(updated);
  }

  // Create a new entry. Use a name based on how many they already have.
  const existingCount = (
    await db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, session.userId), eq(entries.year, year)))
      .all()
  ).length;

  const defaultName =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 40)
      : `Entry ${existingCount + 1}`;

  const id = uuid();
  await db
    .insert(entries)
    .values({
      id,
      userId: session.userId,
      year,
      name: defaultName,
      picks: body.picks || {},
      submittedAt: body.submitted ? new Date().toISOString() : null,
    })
    .run();

  const created = await db.select().from(entries).where(eq(entries.id, id)).get();
  return NextResponse.json(created);
}

// DELETE an entry the current user owns. Also removes its scores.
export async function DELETE(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entryId = request.nextUrl.searchParams.get('entryId');
  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 });

  const existing = await db.select().from(entries).where(eq(entries.id, entryId)).get();
  if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  if (existing.userId !== session.userId && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { client } = await import('@/lib/db');
  await client.execute({ sql: 'DELETE FROM scores WHERE entry_id = ?', args: [entryId] });
  await db.delete(entries).where(eq(entries.id, entryId)).run();

  return NextResponse.json({ ok: true });
}
