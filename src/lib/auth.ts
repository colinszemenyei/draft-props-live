import { db, client } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { v4 as uuid } from 'uuid';

export async function createSession(userId: string): Promise<string> {
  const sessionId = uuid();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  await client.execute({
    sql: 'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    args: [sessionId, userId, expiresAt, new Date().toISOString()],
  });

  const cookieStore = await cookies();
  cookieStore.set('session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return sessionId;
}

export async function getSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session')?.value;
  if (!sessionId) return null;

  const result = await client.execute({
    sql: 'SELECT * FROM sessions WHERE id = ? AND expires_at > ?',
    args: [sessionId, new Date().toISOString()],
  });
  const session = result.rows[0];
  if (!session) return null;

  const user = await db.select().from(users).where(eq(users.id, session.user_id as string)).get();
  if (!user) return null;

  return {
    userId: user.id,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
  };
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session')?.value;
  if (sessionId) {
    await client.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });
    cookieStore.delete('session');
  }
}

// Rate limiting - simple in-memory store
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (record.count >= 5) return false;
  record.count++;
  return true;
}
