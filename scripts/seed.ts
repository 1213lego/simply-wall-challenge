import path from 'path';
import { PrismaClient } from '@prisma/client';
import { StockLoaderService } from '../src/application/services/stock-loader.service';
import { PrismaHistoricalPriceAdapter } from '../src/infrastructure/db/prisma-historical-price.adapter';
import { loadCsv } from '../src/infrastructure/csv-loader/csv-loader';

async function main() {
  const csvPath = process.env.CSV_FILE_PATH
    ? path.resolve(process.env.CSV_FILE_PATH)
    : path.resolve(__dirname, '..', 'ASX_SQL_DUMP.csv');

  console.log(`[seed] Loading CSV from: ${csvPath}`);

  const prisma = new PrismaClient();

  try {
    const historicalPriceAdapter = new PrismaHistoricalPriceAdapter(prisma);
    const stockLoader = new StockLoaderService(prisma, historicalPriceAdapter);

    await loadCsv(csvPath, stockLoader);

    // Verify counts
    const [companies, tradingItems, prices] = await Promise.all([
      prisma.company.count(),
      prisma.tradingItem.count(),
      prisma.historicalPrice.count(),
    ]);

    console.log('\n[seed] Database counts:');
    console.log(`  Companies:        ${companies}`);
    console.log(`  Trading Items:    ${tradingItems}`);
    console.log(`  Historical Prices: ${prices}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
