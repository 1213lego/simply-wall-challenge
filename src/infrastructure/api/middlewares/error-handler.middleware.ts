import type { Request, Response, NextFunction } from 'express';
import { PortfolioNotFoundException } from '../../../application/exceptions/portfolio-not-found.exception';
import { TransactionNotFoundException } from '../../../application/exceptions/transaction-not-found.exception';
import { TradingItemNotFoundException } from '../../../application/exceptions/trading-item-not-found.exception';
import { ValidationException } from '../../../application/exceptions/validation.exception';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationException) {
    res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details,
    });
    return;
  }

  if (
    err instanceof PortfolioNotFoundException ||
    err instanceof TransactionNotFoundException ||
    err instanceof TradingItemNotFoundException
  ) {
    res.status(404).json({
      error: 'Not Found',
      message: err.message,
    });
    return;
  }

  console.error('[error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}
