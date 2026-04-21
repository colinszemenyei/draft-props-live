import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { draftYears } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

// Returns the commissioner's finance info for a given year: entry fee,
// payout description, payment instructions. Authenticated so we don't
// leak Venmo handles etc. to the public internet.
export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(
    request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString()
  );

  const draftYear = await db.select().from(draftYears).where(eq(draftYears.year, year)).get();
  if (!draftYear) return NextResponse.json(null);

  const config = (draftYear.financeConfig ?? {}) as {
    entryFee?: string;
    payoutDescription?: string;
    paymentInstructions?: string;
  };

  return NextResponse.json({
    entryFee: config.entryFee || '',
    payoutDescription: config.payoutDescription || '',
    paymentInstructions: config.paymentInstructions || '',
  });
}
