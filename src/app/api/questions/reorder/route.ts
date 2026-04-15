import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { propQuestions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { sqlite } from '@/lib/db';
import { initializeDatabase } from '@/lib/db/init';

export async function PUT(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { order } = await request.json(); // Array of { id, sortOrder }

  const update = sqlite.transaction(() => {
    for (const item of order) {
      db.update(propQuestions)
        .set({ sortOrder: item.sortOrder })
        .where(eq(propQuestions.id, item.id))
        .run();
    }
  });
  update();

  return NextResponse.json({ ok: true });
}
