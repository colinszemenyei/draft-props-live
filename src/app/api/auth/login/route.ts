import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import bcryptjs from 'bcryptjs';
import { createSession, checkRateLimit } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

export async function POST(request: NextRequest) {
  await initializeDatabase();

  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }

  const { displayName, password } = await request.json();

  if (!displayName || !password) {
    return NextResponse.json({ error: 'Display name and password are required' }, { status: 400 });
  }

  const user = await db.select().from(users).where(eq(users.displayName, displayName)).get();
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = bcryptjs.compareSync(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await createSession(user.id);

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
  });
}
