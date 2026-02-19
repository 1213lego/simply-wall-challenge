import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestPrismaClient, resetTestDb } from './setup';

describe('Portfolio Returns Routes (Integration)', () => {
  const prisma = createTestPrismaClient();
  const app = createApp(prisma);

  let portfolioId: string;
  let emptyPortfolioId: string;

  const COMPANY_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
  const TRADING_ITEM_ID = BigInt(9000001);

  beforeAll(async () => {
    await resetTestDb(prisma);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const d = (n: number) => { const x = new Date(today); x.setUTCDate(x.getUTCDate() - n); return x; };

    await prisma.company.upsert({
      where: { id: COMPANY_ID },
      create: { id: COMPANY_ID, name: 'Test Corp', primaryIndustryId: 1 },
      update: {},
    });
    await prisma.tradingItem.upsert({
      where: { id: TRADING_ITEM_ID },
      create: {
        id: TRADING_ITEM_ID,
        companyId: COMPANY_ID,
        exchangeSymbol: 'ASX',
        tickerSymbol: 'TST',
        exchangeCountryIso: 'AU',
      },
      update: {},
    });

    // 5 consecutive days of prices: d(4)=10, d(3)=11, d(2)=12, d(1)=13, d(0)=14
    await prisma.historicalPrice.createMany({
      data: [
        { tradingItemId: TRADING_ITEM_ID, pricingDate: d(4), priceCloseAud: 10, priceCloseUsd: 7 },
        { tradingItemId: TRADING_ITEM_ID, pricingDate: d(3), priceCloseAud: 11, priceCloseUsd: 7.7 },
        { tradingItemId: TRADING_ITEM_ID, pricingDate: d(2), priceCloseAud: 12, priceCloseUsd: 8.4 },
        { tradingItemId: TRADING_ITEM_ID, pricingDate: d(1), priceCloseAud: 13, priceCloseUsd: 9.1 },
        { tradingItemId: TRADING_ITEM_ID, pricingDate: d(0), priceCloseAud: 14, priceCloseUsd: 9.8 },
      ],
    });

    // Portfolio with 100 shares bought before the range
    const portfolio = await prisma.portfolio.create({ data: { name: 'Returns Test Portfolio' } });
    portfolioId = portfolio.id;
    await prisma.transaction.create({
      data: {
        portfolioId,
        tradingItemId: TRADING_ITEM_ID,
        transactionDate: d(30),
        transactionType: 'buy',
        quantity: 100,
        price: 8,
        currency: 'AUD',
        transactionCost: 0,
      },
    });

    // Portfolio with no transactions for the empty-portfolio test
    const emptyPortfolio = await prisma.portfolio.create({ data: { name: 'Empty Portfolio' } });
    emptyPortfolioId = emptyPortfolio.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns 200 with exactly days data points', async () => {
    const res = await request(app).get(`/api/portfolios/${portfolioId}/returns?days=5`);
    expect(res.status).toBe(200);
    expect(res.body.portfolioId).toBe(portfolioId);
    expect(res.body.returns).toHaveLength(5);
  });

  it('each entry has date (YYYY-MM-DD), portfolioValue and dailyReturn', async () => {
    const res = await request(app).get(`/api/portfolios/${portfolioId}/returns?days=5`);
    for (const r of res.body.returns) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof r.portfolioValue).toBe('number');
      expect(typeof r.dailyReturn).toBe('number');
    }
  });

  it('computes correct portfolioValue and dailyReturn for each day', async () => {
    // 100 shares × prices [10, 11, 12, 13, 14]
    const res = await request(app).get(`/api/portfolios/${portfolioId}/returns?days=5`);
    const returns = res.body.returns;

    expect(returns[0]).toMatchObject({ portfolioValue: 1000, dailyReturn: 0 });          // first day always 0
    expect(returns[1].portfolioValue).toBeCloseTo(1100);
    expect(returns[1].dailyReturn).toBeCloseTo((1100 - 1000) / 1000);                    // 0.1
    expect(returns[2].portfolioValue).toBeCloseTo(1200);
    expect(returns[2].dailyReturn).toBeCloseTo((1200 - 1100) / 1100);                    // ~0.0909
    expect(returns[3].portfolioValue).toBeCloseTo(1300);
    expect(returns[3].dailyReturn).toBeCloseTo((1300 - 1200) / 1200);                    // ~0.0833
    expect(returns[4].portfolioValue).toBeCloseTo(1400);
    expect(returns[4].dailyReturn).toBeCloseTo((1400 - 1300) / 1300);                    // ~0.0769
  });

  it('empty portfolio returns all zeros', async () => {
    const res = await request(app).get(`/api/portfolios/${emptyPortfolioId}/returns?days=5`);
    expect(res.status).toBe(200);
    for (const r of res.body.returns) {
      expect(r.portfolioValue).toBe(0);
      expect(r.dailyReturn).toBe(0);
    }
  });

  it('defaults to 30 days when no days param is provided', async () => {
    const res = await request(app).get(`/api/portfolios/${portfolioId}/returns`);
    expect(res.status).toBe(200);
    expect(res.body.returns).toHaveLength(30);
  });

  it('returns 404 for a non-existent portfolio', async () => {
    const res = await request(app).get(
      '/api/portfolios/00000000-0000-0000-0000-000000000000/returns?days=7',
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for days=0', async () => {
    const res = await request(app).get(`/api/portfolios/${portfolioId}/returns?days=0`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for days=31', async () => {
    const res = await request(app).get(`/api/portfolios/${portfolioId}/returns?days=31`);
    expect(res.status).toBe(400);
  });

  describe('complex trading scenario: multiple buys, a sell, and price swings over 10 days', () => {
    /**
     * Trading item TST2 — prices over 10 days (d9..d0):
     *   d9:10.00  d8:10.50  d7:11.00  d6:11.50  d5:12.00
     *   d4:11.50  d3:11.00  d2:11.50  d1:12.00  d0:12.50
     *
     * Transactions:
     *   d20 buy  100  → initial position, before the 10-day range
     *   d7  buy   50  → holdings: 100 → 150
     *   d3  sell  30  → holdings: 150 → 120
     *   d1  buy   20  → holdings: 120 → 140
     *
     * Expected portfolio value each day:
     *   d9: 100×10.00 = 1000   d8: 100×10.50 = 1050   d7: 150×11.00 = 1650
     *   d6: 150×11.50 = 1725   d5: 150×12.00 = 1800   d4: 150×11.50 = 1725
     *   d3: 120×11.00 = 1320   d2: 120×11.50 = 1380   d1: 140×12.00 = 1680
     *   d0: 140×12.50 = 1750
     */
    let complexPortfolioId: string;
    const TRADING_ITEM_ID_2 = BigInt(9000002);

    beforeAll(async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const d = (n: number) => { const x = new Date(today); x.setUTCDate(x.getUTCDate() - n); return x; };

      await prisma.tradingItem.upsert({
        where: { id: TRADING_ITEM_ID_2 },
        create: {
          id: TRADING_ITEM_ID_2,
          companyId: COMPANY_ID,
          exchangeSymbol: 'ASX',
          tickerSymbol: 'TST2',
          exchangeCountryIso: 'AU',
        },
        update: {},
      });

      await prisma.historicalPrice.createMany({
        data: [
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(9), priceCloseAud: 10.00, priceCloseUsd: 7.00 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(8), priceCloseAud: 10.50, priceCloseUsd: 7.35 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(7), priceCloseAud: 11.00, priceCloseUsd: 7.70 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(6), priceCloseAud: 11.50, priceCloseUsd: 8.05 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(5), priceCloseAud: 12.00, priceCloseUsd: 8.40 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(4), priceCloseAud: 11.50, priceCloseUsd: 8.05 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(3), priceCloseAud: 11.00, priceCloseUsd: 7.70 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(2), priceCloseAud: 11.50, priceCloseUsd: 8.05 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(1), priceCloseAud: 12.00, priceCloseUsd: 8.40 },
          { tradingItemId: TRADING_ITEM_ID_2, pricingDate: d(0), priceCloseAud: 12.50, priceCloseUsd: 8.75 },
        ],
      });

      const portfolio = await prisma.portfolio.create({ data: { name: 'Complex Scenario Portfolio' } });
      complexPortfolioId = portfolio.id;

      await prisma.transaction.createMany({
        data: [
          { portfolioId: complexPortfolioId, tradingItemId: TRADING_ITEM_ID_2, transactionDate: d(20), transactionType: 'buy',  quantity: 100, price:  9.00, currency: 'AUD', transactionCost: 0 },
          { portfolioId: complexPortfolioId, tradingItemId: TRADING_ITEM_ID_2, transactionDate: d(7),  transactionType: 'buy',  quantity:  50, price: 11.00, currency: 'AUD', transactionCost: 0 },
          { portfolioId: complexPortfolioId, tradingItemId: TRADING_ITEM_ID_2, transactionDate: d(3),  transactionType: 'sell', quantity:  30, price: 11.00, currency: 'AUD', transactionCost: 0 },
          { portfolioId: complexPortfolioId, tradingItemId: TRADING_ITEM_ID_2, transactionDate: d(1),  transactionType: 'buy',  quantity:  20, price: 12.00, currency: 'AUD', transactionCost: 0 },
        ],
      });
    });

    it('computes correct portfolioValue and dailyReturn across all 10 days', async () => {
      const res = await request(app).get(`/api/portfolios/${complexPortfolioId}/returns?days=10`);
      expect(res.status).toBe(200);
      const r = res.body.returns;
      expect(r).toHaveLength(10);

      // d(9): initial 100 shares — first day, dailyReturn always 0
      expect(r[0]).toMatchObject({ portfolioValue: 1000, dailyReturn: 0 });

      // d(8): 100 × 10.50 = 1050 — +5 %
      expect(r[1].portfolioValue).toBeCloseTo(1050);
      expect(r[1].dailyReturn).toBeCloseTo((1050 - 1000) / 1000, 4);

      // d(7): buy 50 → 150 shares × 11.00 = 1650
      expect(r[2].portfolioValue).toBeCloseTo(1650);
      expect(r[2].dailyReturn).toBeCloseTo((1650 - 1050) / 1050, 4);

      // d(6): 150 × 11.50 = 1725
      expect(r[3].portfolioValue).toBeCloseTo(1725);
      expect(r[3].dailyReturn).toBeCloseTo((1725 - 1650) / 1650, 4);

      // d(5): 150 × 12.00 = 1800 — peak value
      expect(r[4].portfolioValue).toBeCloseTo(1800);
      expect(r[4].dailyReturn).toBeCloseTo((1800 - 1725) / 1725, 4);

      // d(4): 150 × 11.50 = 1725 — price drops
      expect(r[5].portfolioValue).toBeCloseTo(1725);
      expect(r[5].dailyReturn).toBeCloseTo((1725 - 1800) / 1800, 4);

      // d(3): sell 30 → 120 shares × 11.00 = 1320 — sell + price drop
      expect(r[6].portfolioValue).toBeCloseTo(1320);
      expect(r[6].dailyReturn).toBeCloseTo((1320 - 1725) / 1725, 4);

      // d(2): 120 × 11.50 = 1380
      expect(r[7].portfolioValue).toBeCloseTo(1380);
      expect(r[7].dailyReturn).toBeCloseTo((1380 - 1320) / 1320, 4);

      // d(1): buy 20 → 140 shares × 12.00 = 1680
      expect(r[8].portfolioValue).toBeCloseTo(1680);
      expect(r[8].dailyReturn).toBeCloseTo((1680 - 1380) / 1380, 4);

      // d(0): 140 × 12.50 = 1750
      expect(r[9].portfolioValue).toBeCloseTo(1750);
      expect(r[9].dailyReturn).toBeCloseTo((1750 - 1680) / 1680, 4);
    });
  });
});
