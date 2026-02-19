import { BulkUploadTransactionsSchema, type TransactionItemDto } from '../dtos/transaction.dto';
import type { IPortfolioPort } from '../ports/portfolio.port';
import type { ITransactionPort, CreateTransactionData } from '../ports/transaction.port';
import type { ITradingItemPort } from '../ports/trading-item.port';
import { PortfolioNotFoundException } from '../exceptions/portfolio-not-found.exception';
import { ValidationException } from '../exceptions/validation.exception';
import { parseTicker } from '../../shared/parse-ticker';
import type { Transaction } from '../../models/transaction';

export interface AcceptedTransaction {
  transactionId: string;
  tickerSymbol: string;
  transactionType: string;
  transactionDate: string;
  warnings?: string[];
}

export interface RejectedTransaction {
  transaction: TransactionItemDto;
  reason: string;
}

export interface BulkUploadResult {
  acceptedTransactions: AcceptedTransaction[];
  rejectedTransactions: RejectedTransaction[];
}

export class BulkUploadTransactionsService {
  constructor(
    private readonly portfolioPort: IPortfolioPort,
    private readonly transactionPort: ITransactionPort,
    private readonly tradingItemPort: ITradingItemPort,
  ) {}

  async execute(portfolioId: string, input: unknown): Promise<BulkUploadResult> {
    const parseResult = BulkUploadTransactionsSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ValidationException('Invalid transaction data', parseResult.error.flatten());
    }

    const portfolio = await this.portfolioPort.findById(portfolioId);
    if (!portfolio) {
      throw new PortfolioNotFoundException(portfolioId);
    }

    const { transactions } = parseResult.data;

    // Deduplicate ticker lookups
    const uniqueTickers = new Set(transactions.map((t) => t.tickerSymbol));
    const tradingItemMap = new Map<string, bigint>();

    for (const ticker of uniqueTickers) {
      try {
        const parsed = parseTicker(ticker);
        const item = await this.tradingItemPort.findByExchangeAndTicker(
          parsed.exchangeSymbol,
          parsed.tickerSymbol,
        );
        if (item) {
          tradingItemMap.set(ticker, item.id);
        }
      } catch {
        // Invalid ticker format — will be rejected below
      }
    }

    // Fetch current holdings to track running net quantities in-batch
    const holdingsAt = await this.transactionPort.getHoldingsAt(portfolioId, new Date());
    const runningHoldings = new Map<bigint, number>();
    for (const h of holdingsAt) {
      runningHoldings.set(h.tradingItemId, h.netQuantity);
    }

    const accepted: AcceptedTransaction[] = [];
    const rejected: RejectedTransaction[] = [];
    const toInsert: CreateTransactionData[] = [];
    const toInsertMeta: { ticker: string; txn: TransactionItemDto; warnings: string[] }[] = [];

    for (const txn of transactions) {
      const tradingItemId = tradingItemMap.get(txn.tickerSymbol);
      if (!tradingItemId) {
        rejected.push({
          transaction: txn,
          reason: `Unknown ticker symbol: ${txn.tickerSymbol}`,
        });
        continue;
      }

      const warnings: string[] = [];

      if (txn.transactionType === 'sell') {
        const currentHolding = runningHoldings.get(tradingItemId) ?? 0;
        if (txn.quantity > currentHolding) {
          warnings.push(
            `Sell quantity (${txn.quantity}) exceeds current holdings (${currentHolding}) for ${txn.tickerSymbol}`,
          );
        }
        // Update running holdings
        runningHoldings.set(tradingItemId, currentHolding - txn.quantity);
      } else {
        const currentHolding = runningHoldings.get(tradingItemId) ?? 0;
        runningHoldings.set(tradingItemId, currentHolding + txn.quantity);
      }

      toInsert.push({
        portfolioId,
        tradingItemId,
        transactionDate: new Date(txn.transactionDate),
        transactionType: txn.transactionType,
        quantity: txn.quantity,
        price: txn.price,
        currency: txn.currency,
        transactionCost: txn.transactionCost,
      });
      toInsertMeta.push({ ticker: txn.tickerSymbol, txn, warnings });
    }

    // Bulk insert all accepted transactions
    let inserted: Transaction[] = [];
    if (toInsert.length > 0) {
      inserted = await this.transactionPort.bulkCreate(toInsert);
    }

    for (let i = 0; i < inserted.length; i++) {
      const tx = inserted[i];
      const meta = toInsertMeta[i];
      const result: AcceptedTransaction = {
        transactionId: tx.id,
        tickerSymbol: meta.ticker,
        transactionType: tx.transactionType,
        transactionDate: tx.transactionDate.toISOString(),
      };
      if (meta.warnings.length > 0) {
        result.warnings = meta.warnings;
      }
      accepted.push(result);
    }

    return { acceptedTransactions: accepted, rejectedTransactions: rejected };
  }
}
