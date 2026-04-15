import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { propQuestions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { v4 as uuid } from 'uuid';
import { initializeDatabase } from '@/lib/db/init';

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const year = parseInt(request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());
  const questions = db.select().from(propQuestions)
    .where(eq(propQuestions.year, year))
    .orderBy(propQuestions.sortOrder)
    .all();

  return NextResponse.json(questions);
}

export async function POST(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const id = uuid();

  db.insert(propQuestions).values({
    id,
    year: body.year,
    sortOrder: body.sortOrder || 0,
    questionText: body.questionText,
    questionType: body.questionType,
    answerOptions: body.answerOptions,
    points: body.points || 1,
    category: body.category,
    scoringRule: body.scoringRule,
  }).run();

  const question = db.select().from(propQuestions).where(eq(propQuestions.id, id)).get();
  return NextResponse.json(question);
}
