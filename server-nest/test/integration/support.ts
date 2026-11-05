import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { assertSafeTestDatabase } from './guard.js';

export interface TestDatabase {
  prisma: PrismaClient;
  close: () => Promise<void>;
}

// A client for the test database, over the plain `pg` driver (the app itself uses the Neon one).
// The guard runs first: a wrong address stops the whole file before any query
export function createTestPrisma(): TestDatabase {
  const connectionString = assertSafeTestDatabase(
    process.env.TEST_DATABASE_URL,
  );
  const pool = new Pool({ connectionString, max: 20 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  return {
    prisma,
    close: async () => {
      await prisma.$disconnect();
      // $disconnect may already have closed the pool
      await pool.end().catch(() => undefined);
    },
  };
}

// Empties EVERY table of the test database (the list comes from the database itself, so a
// model added later is never forgotten). The history of migrations stays
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;

  if (tables.length === 0) return;
  const names = tables.map((table) => `"${table.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
  );
}
