import type { ITransactionPort } from '../ports/transaction.port';
import type { IPortfolioPort } from '../ports/portfolio.port';
import { PortfolioNotFoundException } from '../exceptions/portfolio-not-found.exception';
import { TransactionNotFoundException } from '../exceptions/transaction-not-found.exception';

export class DeleteTransactionService {
  constructor(
    private readonly portfolioPort: IPortfolioPort,
    private readonly transactionPort: ITransactionPort,
  ) {}

  async execute(portfolioId: string, transactionId: string): Promise<void> {
    const portfolio = await this.portfolioPort.findById(portfolioId);
    if (!portfolio) {
      throw new PortfolioNotFoundException(portfolioId);
    }

    const existing = await this.transactionPort.findById(transactionId);
    if (!existing || existing.portfolioId !== portfolioId) {
      throw new TransactionNotFoundException(transactionId);
    }

    await this.transactionPort.delete(transactionId);
  }
}
