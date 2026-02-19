import { Router } from 'express';
import type { PortfolioController } from '../controllers/portfolio.controller';
import type { TransactionController } from '../controllers/transaction.controller';

export function createRouter(
  portfolioController: PortfolioController,
  transactionController: TransactionController,
): Router {
  const router = Router();

  // Portfolio routes
  router.post('/portfolios', (req, res, next) =>
    portfolioController.create(req, res, next),
  );

  router.get('/portfolios/:id/returns', (req, res, next) =>
    portfolioController.getReturns(req, res, next),
  );

  // Transaction routes
  router.post('/portfolios/:id/transactions', (req, res, next) =>
    transactionController.bulkUpload(req, res, next),
  );

  router.put('/portfolios/:id/transactions/:transactionId', (req, res, next) =>
    transactionController.update(req, res, next),
  );

  router.delete('/portfolios/:id/transactions/:transactionId', (req, res, next) =>
    transactionController.delete(req, res, next),
  );

  return router;
}
