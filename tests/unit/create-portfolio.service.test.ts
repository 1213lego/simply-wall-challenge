import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreatePortfolioService } from '../../src/application/services/create-portfolio.service';
import type { IPortfolioPort } from '../../src/application/ports/portfolio.port';

describe('CreatePortfolioService', () => {
  let portfolioPort: IPortfolioPort;
  let service: CreatePortfolioService;

  beforeEach(() => {
    portfolioPort = {
      findById: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'uuid-1', name: 'My Portfolio' }),
    };
    service = new CreatePortfolioService(portfolioPort);
  });

  it('creates a portfolio and returns the result', async () => {
    const result = await service.execute({ name: 'My Portfolio' });
    expect(result).toEqual({ id: 'uuid-1', name: 'My Portfolio' });
    expect(portfolioPort.create).toHaveBeenCalledWith({ name: 'My Portfolio' });
  });
});
