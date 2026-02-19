import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteTransactionService } from '../../src/application/services/delete-transaction.service';
import type { IPortfolioPort } from '../../src/application/ports/portfolio.port';
import type { ITransactionPort } from '../../src/application/ports/transaction.port';
import { PortfolioNotFoundException } from '../../src/application/exceptions/portfolio-not-found.exception';
import { TransactionNotFoundException } from '../../src/application/exceptions/transaction-not-found.exception';

const mockPortfolio = { id: 'portfolio-1', name: 'Test' };
const mockTransaction = {
  id: 'txn-1',
  portfolioId: 'portfolio-1',
  tradingItemId: BigInt(1),
  transactionDate: new Date(),
  transactionType: 'buy' as const,
  quantity: 10,
  price: 5,
  currency: 'AUD',
  transactionCost: 0,
};

describe('DeleteTransactionService', () => {
  let portfolioPort: IPortfolioPort;
  let transactionPort: ITransactionPort;
  let service: DeleteTransactionService;

  beforeEach(() => {
    portfolioPort = {
      findById: vi.fn().mockResolvedValue(mockPortfolio),
      create: vi.fn(),
    };
    transactionPort = {
      findById: vi.fn().mockResolvedValue(mockTransaction),
      findByPortfolioId: vi.fn(),
      bulkCreate: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      getHoldingsAt: vi.fn(),
    };
    service = new DeleteTransactionService(portfolioPort, transactionPort);
  });

  it('deletes an existing transaction', async () => {
    await service.execute('portfolio-1', 'txn-1');
    expect(transactionPort.delete).toHaveBeenCalledWith('txn-1');
  });

  it('throws PortfolioNotFoundException for missing portfolio', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue(null);
    await expect(service.execute('missing', 'txn-1')).rejects.toThrow(PortfolioNotFoundException);
  });

  it('throws TransactionNotFoundException for missing transaction', async () => {
    vi.mocked(transactionPort.findById).mockResolvedValue(null);
    await expect(service.execute('portfolio-1', 'missing-txn')).rejects.toThrow(
      TransactionNotFoundException,
    );
  });

  it('throws TransactionNotFoundException if transaction belongs to different portfolio', async () => {
    vi.mocked(transactionPort.findById).mockResolvedValue({
      ...mockTransaction,
      portfolioId: 'other-portfolio',
    });
    await expect(service.execute('portfolio-1', 'txn-1')).rejects.toThrow(
      TransactionNotFoundException,
    );
  });
});
