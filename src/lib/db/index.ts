import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;

function getDbPath() {
  const dbDir = process.env.NODE_ENV === 'production' ? '/data' : path.join(process.cwd(), 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, 'draft-props.db');
}

function initDb() {
  if (!_sqlite) {
    const dbPath = getDbPath();
    _sqlite = new Database(dbPath);
    _sqlite.pragma('journal_mode = WAL');
    _sqlite.pragma('foreign_keys = ON');
    _db = drizzle(_sqlite, { schema });
  }
  return { sqlite: _sqlite, db: _db! };
}

export const sqlite = new Proxy({} as Database.Database, {
  get(_, prop) {
    const { sqlite } = initDb();
    return (sqlite as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_, prop) {
    const { db } = initDb();
    return (db as unknown as Record<string | symbol, unknown>)[prop];
  },
});
