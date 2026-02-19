export type TransactionType = 'buy' | 'sell';

export interface Transaction {
  id: string;
  portfolioId: string;
  tradingItemId: bigint;
  transactionDate: Date;
  transactionType: TransactionType;
  quantity: number;
  price: number;
  currency: string;
  transactionCost: number;
}
