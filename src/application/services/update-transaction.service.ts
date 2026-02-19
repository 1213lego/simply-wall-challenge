import { UpdateTransactionSchema } from '../dtos/transaction.dto';
import type { ITransactionPort } from '../ports/transaction.port';
import type { IPortfolioPort } from '../ports/portfolio.port';
import { PortfolioNotFoundException } from '../exceptions/portfolio-not-found.exception';
import { TransactionNotFoundException } from '../exceptions/transaction-not-found.exception';
import { ValidationException } from '../exceptions/validation.exception';
import type { Transaction } from '../../models/transaction';

export interface UpdateTransactionResult {
  transaction: Transaction;
  warnings?: string[];
}

export class UpdateTransactionService {
  constructor(
    private readonly portfolioPort: IPortfolioPort,
    private readonly transactionPort: ITransactionPort,
  ) {}

  async execute(
    portfolioId: string,
    transactionId: string,
    input: unknown,
  ): Promise<UpdateTransactionResult> {
    const parseResult = UpdateTransactionSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ValidationException('Invalid update data', parseResult.error.flatten());
    }

    const portfolio = await this.portfolioPort.findById(portfolioId);
    if (!portfolio) {
      throw new PortfolioNotFoundException(portfolioId);
    }

    const existing = await this.transactionPort.findById(transactionId);
    if (!existing || existing.portfolioId !== portfolioId) {
      throw new TransactionNotFoundException(transactionId);
    }

    const data = parseResult.data;
    const updateData: Parameters<typeof this.transactionPort.update>[1] = {};

    if (data.transactionDate) updateData.transactionDate = new Date(data.transactionDate);
    if (data.transactionType) updateData.transactionType = data.transactionType;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.currency) updateData.currency = data.currency;
    if (data.transactionCost !== undefined) updateData.transactionCost = data.transactionCost;

    const updated = await this.transactionPort.update(transactionId, updateData);

    const result: UpdateTransactionResult = { transaction: updated };

    // Check sell > holdings warning
    if (updated.transactionType === 'sell') {
      const holdings = await this.transactionPort.getHoldingsAt(portfolioId, updated.transactionDate);
      const holding = holdings.find(
        (h) => h.tradingItemId === updated.tradingItemId,
      );
      // Holdings at date already include this transaction, so net should be non-negative
      // If net is negative, warn
      if (!holding || holding.netQuantity < 0) {
        result.warnings = [
          `Sell quantity may exceed holdings for trading item ${updated.tradingItemId.toString()}`,
        ];
      }
    }

    return result;
  }
}
