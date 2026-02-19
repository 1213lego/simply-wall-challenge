import type { IPortfolioPort } from '../ports/portfolio.port';
import type { ITransactionPort } from '../ports/transaction.port';
import type { IHistoricalPricePort } from '../ports/historical-price.port';
import type { Transaction } from '../../models/transaction';
import { generateDateRange, toUtcMidnight } from '../../shared/date-utils';
import { PortfolioNotFoundException } from '../exceptions/portfolio-not-found.exception';

export interface PortfolioReturnsResult {
  portfolioId: string;
  returns: Array<{
    date: string;
    portfolioValue: number;
    dailyReturn: number;
  }>;
}

type PriceEntry = { date: Date; price: number };

function applyTransaction(holdings: Map<string, number>, txn: Transaction): void {
  const key = txn.tradingItemId.toString();
  const current = holdings.get(key) ?? 0;
  holdings.set(key, txn.transactionType === 'buy' ? current + txn.quantity : current - txn.quantity);
}

function getLastKnownPrice(priceMap: Map<string, PriceEntry[]>, tradingItemId: bigint, date: Date): number {
  const entries = priceMap.get(tradingItemId.toString());
  if (!entries || entries.length === 0) return 0;

  let lo = 0;
  let hi = entries.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].date.getTime() <= date.getTime()) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result >= 0 ? entries[result].price : 0;
}

function computeValue(holdings: Map<string, number>, priceMap: Map<string, PriceEntry[]>, date: Date): number {
  let value = 0;
  for (const [key, quantity] of holdings) {
    if (quantity > 0) {
      value += quantity * getLastKnownPrice(priceMap, BigInt(key), date);
    }
  }
  return value;
}

export class GetPortfolioReturnsService {
  constructor(
    private readonly portfolioPort: IPortfolioPort,
    private readonly transactionPort: ITransactionPort,
    private readonly historicalPricePort: IHistoricalPricePort,
  ) { }

  async execute(portfolioId: string, days: number): Promise<PortfolioReturnsResult> {
    const portfolio = await this.portfolioPort.findById(portfolioId);
    if (!portfolio) {
      throw new PortfolioNotFoundException(portfolioId);
    }

    const endDate = toUtcMidnight(new Date());
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - days + 1);

    const allTxns = await this.transactionPort.findByPortfolioId(portfolioId);
    //Another idea is to get a consolidate or holdings at the begining and end of the range
    //then the transactions in between to avoid fetching all the transactions

    const priceMap = new Map<string, PriceEntry[]>();
    const uniqueIds = [...new Set(allTxns.map((t) => t.tradingItemId))];

    if (uniqueIds.length > 0) {
      const priceStart = new Date(startDate);
      priceStart.setUTCDate(priceStart.getUTCDate() - 7);
      // fetch prices for all trading items in the range, and some days before the start date in case we look up a price at a date market is closed
      // wit this prices we avoid htiing the db each day by each stock
      const prices = await this.historicalPricePort.getPricesInRange(uniqueIds, priceStart, endDate);
      for (const p of prices) {
        const key = p.tradingItemId.toString();
        if (!priceMap.has(key)) priceMap.set(key, []);
        priceMap.get(key)!.push({ date: p.pricingDate, price: p.priceCloseAud });
      }
      for (const [, entries] of priceMap) {
        entries.sort((a, b) => a.date.getTime() - b.date.getTime());
      }
    }

    const holdings = new Map<string, number>();
    for (const txn of allTxns) {
      if (toUtcMidnight(txn.transactionDate) < startDate) {
        applyTransaction(holdings, txn);
      }
    }

    const txnsByDate = new Map<string, Transaction[]>();
    for (const txn of allTxns) {
      const key = toUtcMidnight(txn.transactionDate).toISOString();
      if (!txnsByDate.has(key)) txnsByDate.set(key, []);
      txnsByDate.get(key)!.push(txn);
    }

    const returns: PortfolioReturnsResult['returns'] = [];
    for (const date of generateDateRange(startDate, endDate)) {
      for (const txn of txnsByDate.get(date.toISOString()) ?? []) {
        applyTransaction(holdings, txn);
      }
      const value = computeValue(holdings, priceMap, date);
      const prev = returns.length > 0 ? returns[returns.length - 1].portfolioValue : value;
      const dailyReturn = prev !== 0 ? (value - prev) / prev : 0;
      returns.push({
        date: date.toISOString().split('T')[0],
        portfolioValue: value,
        dailyReturn,
      });
    }

    return { portfolioId, returns };
  }
}
