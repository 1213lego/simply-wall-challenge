import type { PrismaClient } from '@prisma/client';
import type {
  IHistoricalPricePort,
  UpsertHistoricalPriceData,
} from '../../application/ports/historical-price.port';
import type { HistoricalPrice } from '../../models/historical-price';

function mapPrice(p: {
  id: string;
  tradingItemId: bigint;
  pricingDate: Date;
  priceCloseAud: { toNumber(): number };
  priceCloseUsd: { toNumber(): number };
  sharesOutstanding: bigint | null;
  marketCap: { toNumber(): number } | null;
}): HistoricalPrice {
  return {
    id: p.id,
    tradingItemId: p.tradingItemId,
    pricingDate: p.pricingDate,
    priceCloseAud: p.priceCloseAud.toNumber(),
    priceCloseUsd: p.priceCloseUsd.toNumber(),
    sharesOutstanding: p.sharesOutstanding ?? undefined,
    marketCap: p.marketCap?.toNumber(),
  };
}

export class PrismaHistoricalPriceAdapter implements IHistoricalPricePort {
  constructor(private readonly prisma: PrismaClient) { }

  async getPriceAt(tradingItemId: bigint, date: Date): Promise<HistoricalPrice | null> {
    const price = await this.prisma.historicalPrice.findUnique({
      where: { tradingItemId_pricingDate: { tradingItemId, pricingDate: date } },
    });
    if (!price) return null;
    return mapPrice(price);
  }

  async getLastPriceBefore(tradingItemId: bigint, date: Date): Promise<HistoricalPrice | null> {
    const price = await this.prisma.historicalPrice.findFirst({
      where: {
        tradingItemId,
        pricingDate: { lte: date },
      },
      orderBy: { pricingDate: 'desc' },
    });
    if (!price) return null;
    return mapPrice(price);
  }


  async getPricesInRange(
    tradingItemIds: bigint[],
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]> {
    const prices = await this.prisma.historicalPrice.findMany({
      where: {
        tradingItemId: { in: tradingItemIds },
        pricingDate: { gte: startDate, lte: endDate },
      },
      orderBy: [{ tradingItemId: 'asc' }, { pricingDate: 'asc' }],
    });
    return prices.map(mapPrice);
  }

  async bulkUpsert(data: UpsertHistoricalPriceData[]): Promise<void> {
    // Use createMany with skipDuplicates to absorb CSV duplicates per (tradingItemId, pricingDate)
    await this.prisma.historicalPrice.createMany({
      data: data.map((d) => ({
        tradingItemId: d.tradingItemId,
        pricingDate: d.pricingDate,
        priceCloseAud: d.priceCloseAud,
        priceCloseUsd: d.priceCloseUsd,
        sharesOutstanding: d.sharesOutstanding ?? null,
        marketCap: d.marketCap ?? null,
      })),
      skipDuplicates: true,
    });
  }
}
