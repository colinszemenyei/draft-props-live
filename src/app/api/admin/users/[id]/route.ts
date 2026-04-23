import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

// DELETE a user and all their related rows (entries, scores, mock drafts,
// mock scores, sessions). Admin-only, cannot delete yourself.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initializeDatabase();
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.userId) {
    return NextResponse.json({ error: "You can't delete yourself" }, { status: 400 });
  }

  const target = (await client.execute({
    sql: 'SELECT id, display_name, is_admin FROM users WHERE id = ?',
    args: [id],
  })).rows[0] as unknown as { id: string; display_name: string; is_admin: number } | undefined;

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Gather ids up front so we can delete in FK-safe order.
  // FK graph: mock_scores → mock_drafts → entries → users
  //           scores      → entries     → users
  //           sessions                   → users
  // So: drop mock_scores, then mock_drafts (they reference entries),
  // then scores, then entries, then sessions, then the user.
  const entryIds = (await client.execute({
    sql: 'SELECT id FROM entries WHERE user_id = ?',
    args: [id],
  })).rows.map(r => r.id as string);

  const mockIds = (await client.execute({
    sql: 'SELECT id FROM mock_drafts WHERE user_id = ?',
    args: [id],
  })).rows.map(r => r.id as string);

  if (mockIds.length > 0) {
    const placeholders = mockIds.map(() => '?').join(',');
    await client.execute({
      sql: `DELETE FROM mock_scores WHERE mock_draft_id IN (${placeholders})`,
      args: mockIds,
    });
  }
  await client.execute({ sql: 'DELETE FROM mock_drafts WHERE user_id = ?', args: [id] });

  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    await client.execute({
      sql: `DELETE FROM scores WHERE entry_id IN (${placeholders})`,
      args: entryIds,
    });
  }
  await client.execute({ sql: 'DELETE FROM entries WHERE user_id = ?', args: [id] });

  await client.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });
  await client.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });

  return NextResponse.json({
    deleted: target.display_name,
    entries: entryIds.length,
    mocks: mockIds.length,
  });
}

// PUT — rename a user's display name. Admin-only.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initializeDatabase();
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { displayName } = await request.json();

  if (!displayName || typeof displayName !== 'string') {
    return NextResponse.json({ error: 'displayName required' }, { status: 400 });
  }

  const trimmed = displayName.trim();
  if (trimmed.length < 2 || trimmed.length > 30) {
    return NextResponse.json({ error: 'Display name must be 2-30 characters' }, { status: 400 });
  }

  const collision = (await client.execute({
    sql: 'SELECT id FROM users WHERE display_name = ? AND id != ?',
    args: [trimmed, id],
  })).rows[0];
  if (collision) {
    return NextResponse.json({ error: 'Display name already taken' }, { status: 409 });
  }

  await client.execute({
    sql: 'UPDATE users SET display_name = ? WHERE id = ?',
    args: [trimmed, id],
  });

  return NextResponse.json({ id, displayName: trimmed });
}
