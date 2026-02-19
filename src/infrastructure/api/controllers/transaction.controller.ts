import type { Request, Response, NextFunction } from 'express';
import type { BulkUploadTransactionsService } from '../../../application/services/bulk-upload-transactions.service';
import type { UpdateTransactionService } from '../../../application/services/update-transaction.service';
import type { DeleteTransactionService } from '../../../application/services/delete-transaction.service';

export class TransactionController {
  constructor(
    private readonly bulkUploadService: BulkUploadTransactionsService,
    private readonly updateTransactionService: UpdateTransactionService,
    private readonly deleteTransactionService: DeleteTransactionService,
  ) {}

  async bulkUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.bulkUploadService.execute(String(req.params.id), req.body);
      res.status(207).json(result);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.updateTransactionService.execute(
        String(req.params.id),
        String(req.params.transactionId),
        req.body,
      );

      const response: Record<string, unknown> = {
        transaction: serializeTransaction(result.transaction),
      };
      if (result.warnings && result.warnings.length > 0) {
        response.warnings = result.warnings;
      }

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.deleteTransactionService.execute(String(req.params.id), String(req.params.transactionId));
      res.status(200).json({ message: 'Transaction deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}

function serializeTransaction(t: {
  id: string;
  portfolioId: string;
  tradingItemId: bigint;
  transactionDate: Date;
  transactionType: string;
  quantity: number;
  price: number;
  currency: string;
  transactionCost: number;
}): Record<string, unknown> {
  return {
    id: t.id,
    portfolioId: t.portfolioId,
    tradingItemId: t.tradingItemId.toString(),
    transactionDate: t.transactionDate.toISOString(),
    transactionType: t.transactionType,
    quantity: t.quantity,
    price: t.price,
    currency: t.currency,
    transactionCost: t.transactionCost,
  };
}
