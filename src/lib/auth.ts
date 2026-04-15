import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { v4 as uuid } from 'uuid';
import { sqlite } from './db';

interface Session {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = uuid();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  sqlite.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, userId, expiresAt, new Date().toISOString());

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

  const session = sqlite.prepare(
    'SELECT * FROM sessions WHERE id = ? AND expires_at > ?'
  ).get(sessionId, new Date().toISOString()) as Session | undefined;

  if (!session) return null;

  const user = db.select().from(users).where(eq(users.id, session.user_id)).get();
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
    sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
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
