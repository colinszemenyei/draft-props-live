import { NextResponse } from 'next/server';
import prospects from '@/lib/prospects.json';

export async function GET() {
  return NextResponse.json(prospects);
}
