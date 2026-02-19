import { PrismaClient } from '@prisma/client';

// DATABASE_URL is set via vitest config env to point to the test DB
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/portfolio_test_db';

export function createTestPrismaClient(): PrismaClient {
  return new PrismaClient();
}

/**
 * Clears all tables in foreign-key-safe order using Prisma's ORM methods.
 */
export async function resetTestDb(prisma: PrismaClient): Promise<void> {
  await prisma.$connect();
  await prisma.transaction.deleteMany();
  await prisma.historicalPrice.deleteMany();
  await prisma.tradingItem.deleteMany();
  await prisma.company.deleteMany();
  await prisma.portfolio.deleteMany();
}
