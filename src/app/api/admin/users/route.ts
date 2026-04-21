import { NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

// List all users with counts of their entries and mock drafts.
// Admin-only.
export async function GET() {
  await initializeDatabase();
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = (await client.execute({
    sql: `
      SELECT
        u.id,
        u.display_name,
        u.is_admin,
        u.contact,
        u.created_at,
        (SELECT COUNT(*) FROM entries e WHERE e.user_id = u.id) AS entry_count,
        (SELECT COUNT(*) FROM entries e WHERE e.user_id = u.id AND e.submitted_at IS NOT NULL) AS submitted_count,
        (SELECT COUNT(*) FROM mock_drafts m WHERE m.user_id = u.id) AS mock_count,
        (SELECT COUNT(*) FROM mock_drafts m WHERE m.user_id = u.id AND m.submitted_at IS NOT NULL) AS mock_submitted_count
      FROM users u
      ORDER BY u.created_at
    `,
  })).rows as unknown as Array<{
    id: string;
    display_name: string;
    is_admin: number;
    contact: string | null;
    created_at: string;
    entry_count: number;
    submitted_count: number;
    mock_count: number;
    mock_submitted_count: number;
  }>;

  return NextResponse.json(
    rows.map(r => ({
      id: r.id,
      displayName: r.display_name,
      isAdmin: !!r.is_admin,
      contact: r.contact,
      createdAt: r.created_at,
      entryCount: r.entry_count,
      submittedCount: r.submitted_count,
      mockCount: r.mock_count,
      mockSubmittedCount: r.mock_submitted_count,
    }))
  );
}
