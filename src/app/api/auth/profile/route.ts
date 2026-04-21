import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates: { displayName?: string; contact?: string } = {};

  // Optional display name update
  if (body.displayName !== undefined) {
    const newName = String(body.displayName).trim();
    if (!newName || newName.length < 2) {
      return NextResponse.json({ error: 'Display name must be at least 2 characters' }, { status: 400 });
    }
    if (newName.length > 30) {
      return NextResponse.json({ error: 'Display name must be 30 characters or less' }, { status: 400 });
    }
    const existing = await db.select().from(users).where(eq(users.displayName, newName)).get();
    if (existing && existing.id !== session.userId) {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
    }
    updates.displayName = newName;
  }

  // Optional contact update
  if (body.contact !== undefined) {
    const c = String(body.contact).trim();
    if (!c) {
      return NextResponse.json({ error: 'Contact cannot be blank' }, { status: 400 });
    }
    if (c.length > 120) {
      return NextResponse.json({ error: 'Contact is too long' }, { status: 400 });
    }
    updates.contact = c;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, session.userId)).run();

  return NextResponse.json({ ok: true, ...updates });
}
