import type { PrismaClient } from '@prisma/client';
import type { ITradingItemPort } from '../../application/ports/trading-item.port';
import type { TradingItem } from '../../models/trading-item';

export class PrismaTradingItemAdapter implements ITradingItemPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findByExchangeAndTicker(
    exchangeSymbol: string,
    tickerSymbol: string,
  ): Promise<TradingItem | null> {
    const item = await this.prisma.tradingItem.findUnique({
      where: { exchangeSymbol_tickerSymbol: { exchangeSymbol, tickerSymbol } },
    });
    if (!item) return null;
    return {
      id: item.id,
      companyId: item.companyId,
      exchangeSymbol: item.exchangeSymbol,
      tickerSymbol: item.tickerSymbol,
      exchangeCountryIso: item.exchangeCountryIso,
    };
  }
}
