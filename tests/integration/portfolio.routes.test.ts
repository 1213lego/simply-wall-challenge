import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestPrismaClient, resetTestDb } from './setup';

describe('Portfolio Routes (Integration)', () => {
  const prisma = createTestPrismaClient();
  const app = createApp(prisma);

  beforeAll(async () => {
    await resetTestDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/portfolios', () => {
    it('creates a portfolio', async () => {
      const res = await request(app).post('/api/portfolios').send({ name: 'My Test Portfolio' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        portfolioId: expect.any(String),
        name: 'My Test Portfolio',
      });
    });

    it('returns 400 for missing name', async () => {
      const res = await request(app).post('/api/portfolios').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('returns 400 for empty name', async () => {
      const res = await request(app).post('/api/portfolios').send({ name: '' });
      expect(res.status).toBe(400);
    });
  });
});
