import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkUploadTransactionsService } from '../../src/application/services/bulk-upload-transactions.service';
import type { IPortfolioPort } from '../../src/application/ports/portfolio.port';
import type { ITransactionPort } from '../../src/application/ports/transaction.port';
import type { ITradingItemPort } from '../../src/application/ports/trading-item.port';
import { PortfolioNotFoundException } from '../../src/application/exceptions/portfolio-not-found.exception';
import { ValidationException } from '../../src/application/exceptions/validation.exception';

const mockPortfolio = { id: 'portfolio-1', name: 'Test Portfolio' };
const mockTradingItem = {
  id: BigInt(20164362),
  companyId: 'company-1',
  exchangeSymbol: 'ASX',
  tickerSymbol: 'BHP',
  exchangeCountryIso: 'AU',
};
const mockTransaction = {
  id: 'txn-1',
  portfolioId: 'portfolio-1',
  tradingItemId: BigInt(20164362),
  transactionDate: new Date('2024-01-15T00:00:00Z'),
  transactionType: 'buy' as const,
  quantity: 100,
  price: 50,
  currency: 'AUD',
  transactionCost: 0,
};

describe('BulkUploadTransactionsService', () => {
  let portfolioPort: IPortfolioPort;
  let transactionPort: ITransactionPort;
  let tradingItemPort: ITradingItemPort;
  let service: BulkUploadTransactionsService;

  beforeEach(() => {
    portfolioPort = {
      findById: vi.fn().mockResolvedValue(mockPortfolio),
      create: vi.fn(),
    };
    transactionPort = {
      findById: vi.fn(),
      findByPortfolioId: vi.fn().mockResolvedValue([]),
      bulkCreate: vi.fn().mockResolvedValue([mockTransaction]),
      update: vi.fn(),
      delete: vi.fn(),
      getHoldingsAt: vi.fn().mockResolvedValue([]),
    };
    tradingItemPort = {
      findByExchangeAndTicker: vi.fn().mockResolvedValue(mockTradingItem),
    };
    service = new BulkUploadTransactionsService(portfolioPort, transactionPort, tradingItemPort);
  });

  it('accepts valid buy transaction', async () => {
    const result = await service.execute('portfolio-1', {
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

    expect(result.acceptedTransactions).toHaveLength(1);
    expect(result.rejectedTransactions).toHaveLength(0);
    expect(result.acceptedTransactions[0].transactionId).toBe('txn-1');
  });

  it('rejects unknown ticker', async () => {
    vi.mocked(tradingItemPort.findByExchangeAndTicker).mockResolvedValue(null);

    const result = await service.execute('portfolio-1', {
      transactions: [
        {
          tickerSymbol: 'ASX:UNKNOWN',
          transactionDate: '2024-01-15T00:00:00Z',
          transactionType: 'buy',
          quantity: 100,
          price: 50,
          currency: 'AUD',
          transactionCost: 0,
        },
      ],
    });

    expect(result.acceptedTransactions).toHaveLength(0);
    expect(result.rejectedTransactions).toHaveLength(1);
    expect(result.rejectedTransactions[0].reason).toContain('Unknown ticker symbol');
  });

  it('adds warning for sell > holdings', async () => {
    vi.mocked(transactionPort.getHoldingsAt).mockResolvedValue([
      { tradingItemId: BigInt(20164362), netQuantity: 50 },
    ]);
    vi.mocked(transactionPort.bulkCreate).mockResolvedValue([
      { ...mockTransaction, transactionType: 'sell', quantity: 100 },
    ]);

    const result = await service.execute('portfolio-1', {
      transactions: [
        {
          tickerSymbol: 'ASX:BHP',
          transactionDate: '2024-01-15T00:00:00Z',
          transactionType: 'sell',
          quantity: 100,
          price: 50,
          currency: 'AUD',
          transactionCost: 0,
        },
      ],
    });

    expect(result.acceptedTransactions).toHaveLength(1);
    expect(result.acceptedTransactions[0].warnings).toBeDefined();
    expect(result.acceptedTransactions[0].warnings![0]).toContain('exceeds current holdings');
  });

  it('throws PortfolioNotFoundException for missing portfolio', async () => {
    vi.mocked(portfolioPort.findById).mockResolvedValue(null);
    await expect(
      service.execute('missing-id', {
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
      }),
    ).rejects.toThrow(PortfolioNotFoundException);
  });

  it('throws ValidationException for invalid data', async () => {
    await expect(
      service.execute('portfolio-1', { transactions: [{ invalid: true }] }),
    ).rejects.toThrow(ValidationException);
  });
});
