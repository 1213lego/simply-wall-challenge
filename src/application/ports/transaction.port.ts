import type { Transaction, TransactionType } from '../../models/transaction';

export interface CreateTransactionData {
  portfolioId: string;
  tradingItemId: bigint;
  transactionDate: Date;
  transactionType: TransactionType;
  quantity: number;
  price: number;
  currency?: string;
  transactionCost?: number;
}

export interface UpdateTransactionData {
  transactionDate?: Date;
  transactionType?: TransactionType;
  quantity?: number;
  price?: number;
  currency?: string;
  transactionCost?: number;
}

export interface HoldingRecord {
  tradingItemId: bigint;
  netQuantity: number;
}

export interface ITransactionPort {
  findById(id: string): Promise<Transaction | null>;
  findByPortfolioId(portfolioId: string): Promise<Transaction[]>;
  bulkCreate(data: CreateTransactionData[]): Promise<Transaction[]>;
  update(id: string, data: UpdateTransactionData): Promise<Transaction>;
  delete(id: string): Promise<void>;
  getHoldingsAt(portfolioId: string, date: Date): Promise<HoldingRecord[]>;
}
