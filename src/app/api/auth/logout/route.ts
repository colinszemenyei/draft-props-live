import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

export async function POST() {
  await initializeDatabase();
  await destroySession();
  return NextResponse.json({ ok: true });
}
