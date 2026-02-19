import type { PrismaClient } from '@prisma/client';
import type {
  ITransactionPort,
  CreateTransactionData,
  UpdateTransactionData,
  HoldingRecord,
} from '../../application/ports/transaction.port';
import type { Transaction } from '../../models/transaction';
import type { TransactionType } from '../../models/transaction';

function mapTransaction(t: {
  id: string;
  portfolioId: string;
  tradingItemId: bigint;
  transactionDate: Date;
  transactionType: 'buy' | 'sell';
  quantity: { toNumber(): number };
  price: { toNumber(): number };
  currency: string;
  transactionCost: { toNumber(): number };
}): Transaction {
  return {
    id: t.id,
    portfolioId: t.portfolioId,
    tradingItemId: t.tradingItemId,
    transactionDate: t.transactionDate,
    transactionType: t.transactionType as TransactionType,
    quantity: t.quantity.toNumber(),
    price: t.price.toNumber(),
    currency: t.currency,
    transactionCost: t.transactionCost.toNumber(),
  };
}

export class PrismaTransactionAdapter implements ITransactionPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Transaction | null> {
    const t = await this.prisma.transaction.findUnique({ where: { id } });
    if (!t) return null;
    return mapTransaction(t);
  }

  async findByPortfolioId(portfolioId: string): Promise<Transaction[]> {
    const txns = await this.prisma.transaction.findMany({
      where: { portfolioId },
      orderBy: { transactionDate: 'asc' },
    });
    return txns.map(mapTransaction);
  }

  async bulkCreate(data: CreateTransactionData[]): Promise<Transaction[]> {
    const created = await this.prisma.transaction.createManyAndReturn({
      data: data.map((d) => ({
        portfolioId: d.portfolioId,
        tradingItemId: d.tradingItemId,
        transactionDate: d.transactionDate,
        transactionType: d.transactionType,
        quantity: d.quantity,
        price: d.price,
        currency: d.currency ?? 'AUD',
        transactionCost: d.transactionCost ?? 0,
      })),
    });
    return created.map(mapTransaction);
  }

  async update(id: string, data: UpdateTransactionData): Promise<Transaction> {
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(data.transactionDate && { transactionDate: data.transactionDate }),
        ...(data.transactionType && { transactionType: data.transactionType }),
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.currency && { currency: data.currency }),
        ...(data.transactionCost !== undefined && { transactionCost: data.transactionCost }),
      },
    });
    return mapTransaction(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.transaction.delete({ where: { id } });
  }

  async getHoldingsAt(portfolioId: string, date: Date): Promise<HoldingRecord[]> {
    const result = await this.prisma.$queryRaw<
      { tradingItemId: bigint; netQuantity: string }[]
    >`
      SELECT
        "tradingItemId",
        SUM(
          CASE WHEN "transactionType" = 'buy' THEN quantity
               ELSE -quantity
          END
        ) AS "netQuantity"
      FROM transactions
      WHERE "portfolioId" = ${portfolioId}::uuid
        AND "transactionDate" <= ${date}
      GROUP BY "tradingItemId"
    `;

    return result.map((r) => ({
      tradingItemId: r.tradingItemId,
      netQuantity: parseFloat(r.netQuantity),
    }));
  }
}
