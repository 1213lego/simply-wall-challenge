import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestPrismaClient, resetTestDb } from './setup';

describe('Transaction Routes (Integration)', () => {
  const prisma = createTestPrismaClient();
  const app = createApp(prisma);
  let portfolioId: string;

  beforeAll(async () => {
    await resetTestDb(prisma);

    // Seed a company, trading item for ASX:BHP
    await prisma.company.upsert({
      where: { id: 'c30a1c53-873b-4e04-94be-b8153ca6e0d2' },
      create: {
        id: 'c30a1c53-873b-4e04-94be-b8153ca6e0d2',
        name: 'Test Company',
        primaryIndustryId: 1000,
      },
      update: {},
    });

    await prisma.tradingItem.upsert({
      where: { id: BigInt(20164362) },
      create: {
        id: BigInt(20164362),
        companyId: 'c30a1c53-873b-4e04-94be-b8153ca6e0d2',
        exchangeSymbol: 'ASX',
        tickerSymbol: 'BHP',
        exchangeCountryIso: 'AU',
      },
      update: {},
    });

    // Create a portfolio
    const createRes = await request(app)
      .post('/api/portfolios')
      .send({ name: 'Txn Test Portfolio' });
    portfolioId = createRes.body.portfolioId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/portfolios/:id/transactions', () => {
    it('accepts valid buy transaction', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${portfolioId}/transactions`)
        .send({
          transactions: [
            {
              tickerSymbol: 'ASX:BHP',
              transactionDate: '2024-01-15T00:00:00Z',
              transactionType: 'buy',
              quantity: 100,
              price: 50,
              currency: 'AUD',
              transactionCost: 0,
            },
          ],
        });

      expect(res.status).toBe(207);
      expect(res.body.acceptedTransactions).toHaveLength(1);
      expect(res.body.rejectedTransactions).toHaveLength(0);
      expect(res.body.acceptedTransactions[0]).toMatchObject({
        transactionId: expect.any(String),
        tickerSymbol: 'ASX:BHP',
        transactionType: 'buy',
      });
    });

    it('rejects unknown ticker with reason', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${portfolioId}/transactions`)
        .send({
          transactions: [
            {
              tickerSymbol: 'ASX:UNKNOWN',
              transactionDate: '2024-01-15T00:00:00Z',
              transactionType: 'buy',
              quantity: 10,
              price: 5,
              currency: 'AUD',
              transactionCost: 0,
            },
          ],
        });

      expect(res.status).toBe(207);
      expect(res.body.acceptedTransactions).toHaveLength(0);
      expect(res.body.rejectedTransactions).toHaveLength(1);
      expect(res.body.rejectedTransactions[0].reason).toContain('Unknown ticker symbol');
    });

    it('accepts sell with warning when exceeds holdings', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${portfolioId}/transactions`)
        .send({
          transactions: [
            {
              tickerSymbol: 'ASX:BHP',
              transactionDate: '2025-01-01T00:00:00Z',
              transactionType: 'sell',
              quantity: 99999,
              price: 50,
              currency: 'AUD',
              transactionCost: 0,
            },
          ],
        });

      expect(res.status).toBe(207);
      expect(res.body.acceptedTransactions).toHaveLength(1);
      expect(res.body.acceptedTransactions[0].warnings).toBeDefined();
      expect(res.body.acceptedTransactions[0].warnings[0]).toContain('exceeds current holdings');
    });

    it('returns 404 for missing portfolio', async () => {
      const res = await request(app)
        .post('/api/portfolios/00000000-0000-0000-0000-000000000000/transactions')
        .send({
          transactions: [
            {
              tickerSymbol: 'ASX:BHP',
              transactionDate: '2024-01-15T00:00:00Z',
              transactionType: 'buy',
              quantity: 10,
              price: 5,
              currency: 'AUD',
              transactionCost: 0,
            },
          ],
        });
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid transaction data', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${portfolioId}/transactions`)
        .send({ transactions: [{ invalid: true }] });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/portfolios/:id/transactions/:transactionId', () => {
    it('updates a transaction', async () => {
      // Create a transaction first
      const uploadRes = await request(app)
        .post(`/api/portfolios/${portfolioId}/transactions`)
        .send({
          transactions: [
            {
              tickerSymbol: 'ASX:BHP',
              transactionDate: '2024-06-01T00:00:00Z',
              transactionType: 'buy',
              quantity: 50,
              price: 45,
              currency: 'AUD',
              transactionCost: 10,
            },
          ],
        });

      const transactionId = uploadRes.body.acceptedTransactions[0].transactionId;

      const res = await request(app)
        .put(`/api/portfolios/${portfolioId}/transactions/${transactionId}`)
        .send({ quantity: 75, price: 46 });

      expect(res.status).toBe(200);
      expect(res.body.transaction).toMatchObject({
        id: transactionId,
        quantity: 75,
        price: 46,
      });
    });

    it('returns 404 for missing transaction', async () => {
      const res = await request(app)
        .put(
          `/api/portfolios/${portfolioId}/transactions/00000000-0000-0000-0000-000000000000`,
        )
        .send({ quantity: 10 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/portfolios/:id/transactions/:transactionId', () => {
    it('deletes a transaction', async () => {
      const uploadRes = await request(app)
        .post(`/api/portfolios/${portfolioId}/transactions`)
        .send({
          transactions: [
            {
              tickerSymbol: 'ASX:BHP',
              transactionDate: '2024-07-01T00:00:00Z',
              transactionType: 'buy',
              quantity: 30,
              price: 40,
              currency: 'AUD',
              transactionCost: 0,
            },
          ],
        });

      const transactionId = uploadRes.body.acceptedTransactions[0].transactionId;

      const res = await request(app).delete(
        `/api/portfolios/${portfolioId}/transactions/${transactionId}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });

    it('returns 404 for missing transaction', async () => {
      const res = await request(app).delete(
        `/api/portfolios/${portfolioId}/transactions/00000000-0000-0000-0000-000000000000`,
      );
      expect(res.status).toBe(404);
    });
  });
});
