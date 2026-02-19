import type { IPortfolioPort } from '../ports/portfolio.port';
import type { ITransactionPort } from '../ports/transaction.port';
import type { IHistoricalPricePort } from '../ports/historical-price.port';

export interface PortfolioReturnsResult {
  portfolioId: string;
  returns: Array<{
    date: string;
    portfolioValue: number;
    dailyReturn: number;
  }>;
}

export class GetPortfolioReturnsService {
  constructor(
    private readonly portfolioPort: IPortfolioPort,
    private readonly transactionPort: ITransactionPort,
    private readonly historicalPricePort: IHistoricalPricePort,
  ) {}

  async execute(_portfolioId: string, _days: number): Promise<PortfolioReturnsResult> {
    throw new Error('Not implemented');
  }
}
