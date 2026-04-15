import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

export async function GET() {
  await initializeDatabase();
  const session = await getSession();
  if (!session) {
    return NextResponse.json(null, { status: 401 });
  }
  return NextResponse.json(session);
}
