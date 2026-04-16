import { createClient, Client } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

const url = process.env.TURSO_DATABASE_URL || 'file:data/draft-props.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client: Client = createClient({
  url,
  ...(authToken ? { authToken } : {}),
});

export const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });
