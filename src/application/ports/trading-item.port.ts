import type { TradingItem } from '../../models/trading-item';

export interface ITradingItemPort {
  findByExchangeAndTicker(exchangeSymbol: string, tickerSymbol: string): Promise<TradingItem | null>;
}
