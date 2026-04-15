import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { propQuestions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db/init';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  db.update(propQuestions)
    .set({
      questionText: body.questionText,
      questionType: body.questionType,
      answerOptions: body.answerOptions,
      correctAnswer: body.correctAnswer,
      points: body.points,
      category: body.category,
      sortOrder: body.sortOrder,
      scoringRule: body.scoringRule,
    })
    .where(eq(propQuestions.id, id))
    .run();

  const question = db.select().from(propQuestions).where(eq(propQuestions.id, id)).get();
  return NextResponse.json(question);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  db.delete(propQuestions).where(eq(propQuestions.id, id)).run();
  return NextResponse.json({ ok: true });
}
