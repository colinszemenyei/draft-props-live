import { runMigrations } from './migrate';
import { db } from './index';
import { users, draftYears } from './schema';
import { eq } from 'drizzle-orm';
import bcryptjs from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { seedStarterQuestions } from './seed';

let initialized = false;

export async function initializeDatabase() {
  if (initialized) return;

  runMigrations();

  // Create admin user if it doesn't exist
  const adminName = process.env.ADMIN_USERNAME || 'Commissioner';
  const adminPassword = process.env.ADMIN_PASSWORD || 'draftday2026';

  const existing = db.select().from(users).where(eq(users.displayName, adminName)).get();
  if (!existing) {
    const hash = bcryptjs.hashSync(adminPassword, 12);
    db.insert(users).values({
      id: uuid(),
      displayName: adminName,
      passwordHash: hash,
      isAdmin: true,
    }).run();
  }

  // Create 2026 draft year if it doesn't exist
  const draftYear = parseInt(process.env.DRAFT_YEAR || '2026');
  const existingYear = db.select().from(draftYears).where(eq(draftYears.year, draftYear)).get();
  if (!existingYear) {
    db.insert(draftYears).values({
      year: draftYear,
      lockTime: new Date('2026-04-23T19:50:00-04:00').toISOString(), // 10 min before 8pm ET
      status: 'open',
    }).run();
    seedStarterQuestions(draftYear);
  }

  initialized = true;
}
