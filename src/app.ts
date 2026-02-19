import express from 'express';
import type { PrismaClient } from '@prisma/client';

import { PrismaPortfolioAdapter } from './infrastructure/db/prisma-portfolio.adapter';
import { PrismaTransactionAdapter } from './infrastructure/db/prisma-transaction.adapter';
import { PrismaTradingItemAdapter } from './infrastructure/db/prisma-trading-item.adapter';
import { PrismaHistoricalPriceAdapter } from './infrastructure/db/prisma-historical-price.adapter';

import { CreatePortfolioService } from './application/services/create-portfolio.service';
import { BulkUploadTransactionsService } from './application/services/bulk-upload-transactions.service';
import { UpdateTransactionService } from './application/services/update-transaction.service';
import { DeleteTransactionService } from './application/services/delete-transaction.service';
import { GetPortfolioReturnsService } from './application/services/get-portfolio-returns.service';

import { PortfolioController } from './infrastructure/api/controllers/portfolio.controller';
import { TransactionController } from './infrastructure/api/controllers/transaction.controller';
import { createRouter } from './infrastructure/api/routes/index';
import { errorHandler } from './infrastructure/api/middlewares/error-handler.middleware';

export function createApp(prisma: PrismaClient) {
  // Adapters
  const portfolioAdapter = new PrismaPortfolioAdapter(prisma);
  const transactionAdapter = new PrismaTransactionAdapter(prisma);
  const tradingItemAdapter = new PrismaTradingItemAdapter(prisma);
  const historicalPriceAdapter = new PrismaHistoricalPriceAdapter(prisma);

  // Services
  const createPortfolioService = new CreatePortfolioService(portfolioAdapter);
  const bulkUploadService = new BulkUploadTransactionsService(
    portfolioAdapter,
    transactionAdapter,
    tradingItemAdapter,
  );
  const updateTransactionService = new UpdateTransactionService(portfolioAdapter, transactionAdapter);
  const deleteTransactionService = new DeleteTransactionService(portfolioAdapter, transactionAdapter);
  const getPortfolioReturnsService = new GetPortfolioReturnsService(
    portfolioAdapter,
    transactionAdapter,
    historicalPriceAdapter,
  );

  // Controllers
  const portfolioController = new PortfolioController(
    createPortfolioService,
    getPortfolioReturnsService,
  );
  const transactionController = new TransactionController(
    bulkUploadService,
    updateTransactionService,
    deleteTransactionService,
  );

  // Express app
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const apiRouter = createRouter(portfolioController, transactionController);
  app.use('/api', apiRouter);

  app.use(errorHandler);

  return app;
}
