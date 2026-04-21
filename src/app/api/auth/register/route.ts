import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import bcryptjs from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { createSession, checkRateLimit } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

export async function POST(request: NextRequest) {
  await initializeDatabase();

  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }

  const { displayName, password, contact } = await request.json();

  if (!displayName || !password) {
    return NextResponse.json({ error: 'Display name and password are required' }, { status: 400 });
  }

  if (displayName.length < 2 || displayName.length > 30) {
    return NextResponse.json({ error: 'Display name must be 2-30 characters' }, { status: 400 });
  }

  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  const contactTrimmed = typeof contact === 'string' ? contact.trim() : '';
  if (!contactTrimmed) {
    return NextResponse.json({
      error: 'Contact info (email or phone) is required so the commissioner can reach you for payment'
    }, { status: 400 });
  }
  if (contactTrimmed.length > 120) {
    return NextResponse.json({ error: 'Contact info is too long' }, { status: 400 });
  }

  const existing = await db.select().from(users).where(eq(users.displayName, displayName)).get();
  if (existing) {
    return NextResponse.json({ error: 'Display name already taken' }, { status: 409 });
  }

  const hash = bcryptjs.hashSync(password, 12);
  const id = uuid();

  await db.insert(users).values({
    id,
    displayName,
    passwordHash: hash,
    isAdmin: false,
    contact: contactTrimmed,
  }).run();

  await createSession(id);

  return NextResponse.json({ id, displayName, isAdmin: false });
}
