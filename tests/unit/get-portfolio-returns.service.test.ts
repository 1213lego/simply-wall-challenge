import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPortfolioReturnsService } from '../../src/application/services/get-portfolio-returns.service';
import { PortfolioNotFoundException } from '../../src/application/exceptions/portfolio-not-found.exception';
import { toUtcMidnight } from '../../src/shared/date-utils';
import type { IPortfolioPort } from '../../src/application/ports/portfolio.port';
import type { ITransactionPort } from '../../src/application/ports/transaction.port';
import type { IHistoricalPricePort } from '../../src/application/ports/historical-price.port';
import type { Transaction } from '../../src/models/transaction';
import type { HistoricalPrice } from '../../src/models/historical-price';

const ITEM_A = BigInt(1);
const ITEM_B = BigInt(2);

// Computed once at module load — stable for the entire test run
const today = toUtcMidnight(new Date());
function daysAgo(n: number): Date {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    portfolioId: 'p1',
    tradingItemId: ITEM_A,
    transactionDate: daysAgo(30), // well before any range used in tests
    transactionType: 'buy',
    quantity: 100,
    price: 10,
    currency: 'AUD',
    transactionCost: 0,
    ...overrides,
  };
}

function makePrice(tradingItemId: bigint, date: Date, priceCloseAud: number): HistoricalPrice {
  return {
    id: `hp-${tradingItemId}-${date.toISOString()}`,
    tradingItemId,
    pricingDate: date,
    priceCloseAud,
    priceCloseUsd: priceCloseAud * 0.65,
  };
}

describe('GetPortfolioReturnsService', () => {
  let portfolioPort: IPortfolioPort;
  let transactionPort: ITransactionPort;
  let historicalPricePort: IHistoricalPricePort;
  let service: GetPortfolioReturnsService;

  beforeEach(() => {
    portfolioPort = {
      findById: vi.fn(),
      create: vi.fn(),
    };
    transactionPort = {
      findById: vi.fn(),
      findByPortfolioId: vi.fn().mockResolvedValue([]),
      bulkCreate: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getHoldingsAt: vi.fn(),
    };
    historicalPricePort = {
      getPriceAt: vi.fn(),
      getLastPriceBefore: vi.fn(),
      getPricesInRange: vi.fn().mockResolvedValue([]),
      bulkUpsert: vi.fn(),
    };
    service = new GetPortfolioReturnsService(portfolioPort, transactionPort, historicalPricePort);
  });

  it('throws PortfolioNotFoundException for a missing portfolio', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue(null);
    await expect(service.execute('bad-id', 7)).rejects.toThrow(PortfolioNotFoundException);
  });

  it.each([1, 7, 30])('returns exactly %i data points', async (days) => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    const result = await service.execute('p1', days);
    expect(result.returns).toHaveLength(days);
  });

  it('empty portfolio: every entry has portfolioValue=0 and dailyReturn=0', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    const result = await service.execute('p1', 5);
    for (const r of result.returns) {
      expect(r.portfolioValue).toBe(0);
      expect(r.dailyReturn).toBe(0);
    }
  });

  it('dailyReturn is 0 on the first day regardless of portfolio value', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    vi.mocked(transactionPort.findByPortfolioId).mockResolvedValue([makeTxn()]);
    vi.mocked(historicalPricePort.getPricesInRange).mockResolvedValue([
      makePrice(ITEM_A, daysAgo(4), 50),
    ]);
    const result = await service.execute('p1', 5);
    expect(result.returns[0].portfolioValue).toBe(5000); // 100 × 50
    expect(result.returns[0].dailyReturn).toBe(0);
  });

  it('buy before range: correct portfolioValue and dailyReturn for each day', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    // 100 shares bought 30 days ago — initial holdings for the entire range
    vi.mocked(transactionPort.findByPortfolioId).mockResolvedValue([makeTxn()]);
    vi.mocked(historicalPricePort.getPricesInRange).mockResolvedValue([
      makePrice(ITEM_A, daysAgo(2), 10),
      makePrice(ITEM_A, daysAgo(1), 11),
      makePrice(ITEM_A, daysAgo(0), 12),
    ]);

    const result = await service.execute('p1', 3);

    expect(result.returns[0]).toMatchObject({ portfolioValue: 1000, dailyReturn: 0 });
    expect(result.returns[1]).toMatchObject({ portfolioValue: 1100, dailyReturn: expect.closeTo(0.1) });
    expect(result.returns[2]).toMatchObject({ portfolioValue: 1200, dailyReturn: expect.closeTo(1200 / 1100 - 1) });
  });

  it('buy within range: holdings are 0 before the buy day, then appear', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    // Buy 100 shares on d(1), which falls inside the 3-day range [d(2), d(1), d(0)]
    vi.mocked(transactionPort.findByPortfolioId).mockResolvedValue([
      makeTxn({ id: 't2', transactionDate: daysAgo(1) }),
    ]);
    vi.mocked(historicalPricePort.getPricesInRange).mockResolvedValue([
      makePrice(ITEM_A, daysAgo(2), 10),
      makePrice(ITEM_A, daysAgo(1), 10),
      makePrice(ITEM_A, daysAgo(0), 10),
    ]);

    const result = await service.execute('p1', 3);

    expect(result.returns[0].portfolioValue).toBe(0);     // d(2): buy not yet applied
    expect(result.returns[1].portfolioValue).toBe(1000);  // d(1): 100 × 10
    expect(result.returns[2].portfolioValue).toBe(1000);  // d(0): unchanged
  });

  it('sell within range: reduces holdings from that day forward', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    vi.mocked(transactionPort.findByPortfolioId).mockResolvedValue([
      makeTxn({ quantity: 200 }),                                                                     // buy 200 before range
      makeTxn({ id: 't2', transactionDate: daysAgo(1), transactionType: 'sell', quantity: 50 }),     // sell 50 on d(1)
    ]);
    vi.mocked(historicalPricePort.getPricesInRange).mockResolvedValue([
      makePrice(ITEM_A, daysAgo(2), 10),
      makePrice(ITEM_A, daysAgo(1), 10),
      makePrice(ITEM_A, daysAgo(0), 10),
    ]);

    const result = await service.execute('p1', 3);

    expect(result.returns[0].portfolioValue).toBe(2000);               // 200 × 10
    expect(result.returns[1].portfolioValue).toBe(1500);               // 150 × 10
    expect(result.returns[1].dailyReturn).toBeCloseTo(-0.25);          // (1500 − 2000) / 2000
    expect(result.returns[2].portfolioValue).toBe(1500);               // 150 × 10, unchanged
  });

  it('carry-forward: last known price used on days with no price data', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    vi.mocked(transactionPort.findByPortfolioId).mockResolvedValue([makeTxn()]);
    // d(1) has no price — service should carry d(2)'s price of 10
    vi.mocked(historicalPricePort.getPricesInRange).mockResolvedValue([
      makePrice(ITEM_A, daysAgo(2), 10),
      makePrice(ITEM_A, daysAgo(0), 20),
    ]);

    const result = await service.execute('p1', 3);

    expect(result.returns[0]).toMatchObject({ portfolioValue: 1000, dailyReturn: 0 });   // d(2): 100 × 10
    expect(result.returns[1]).toMatchObject({ portfolioValue: 1000, dailyReturn: 0 });   // d(1): carry-forward 10
    expect(result.returns[2]).toMatchObject({ portfolioValue: 2000, dailyReturn: expect.closeTo(1.0) }); // d(0): 100 × 20
  });

  it('multiple holdings: portfolioValue sums all positions', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    vi.mocked(transactionPort.findByPortfolioId).mockResolvedValue([
      makeTxn({ tradingItemId: ITEM_A, quantity: 100 }),           // ITEM_A: 100 shares
      makeTxn({ id: 't2', tradingItemId: ITEM_B, quantity: 50 }), // ITEM_B:  50 shares
    ]);
    vi.mocked(historicalPricePort.getPricesInRange).mockResolvedValue([
      makePrice(ITEM_A, daysAgo(0), 20), // 100 × 20 = 2000
      makePrice(ITEM_B, daysAgo(0), 10), //  50 × 10 =  500
    ]);

    const result = await service.execute('p1', 1);

    expect(result.returns[0].portfolioValue).toBe(2500);
  });

  it('no price data: portfolioValue is 0 even when holdings are positive', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue({ id: 'p1', name: 'P' });
    vi.mocked(transactionPort.findByPortfolioId).mockResolvedValue([makeTxn()]);
    vi.mocked(historicalPricePort.getPricesInRange).mockResolvedValue([]);
    const result = await service.execute('p1', 3);
    for (const r of result.returns) {
      expect(r.portfolioValue).toBe(0);
    }
  });
});
