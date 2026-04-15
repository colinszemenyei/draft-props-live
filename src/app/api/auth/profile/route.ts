import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const newName = (body.displayName || '').trim();

  if (!newName || newName.length < 2) {
    return NextResponse.json({ error: 'Display name must be at least 2 characters' }, { status: 400 });
  }
  if (newName.length > 30) {
    return NextResponse.json({ error: 'Display name must be 30 characters or less' }, { status: 400 });
  }

  // Check if name is already taken by someone else
  const existing = db.select().from(users).where(eq(users.displayName, newName)).get();
  if (existing && existing.id !== session.userId) {
    return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
  }

  db.update(users)
    .set({ displayName: newName })
    .where(eq(users.id, session.userId))
    .run();

  return NextResponse.json({ ok: true, displayName: newName });
}
