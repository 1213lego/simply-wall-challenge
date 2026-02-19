import type { HistoricalPrice } from '../../models/historical-price';

export interface UpsertHistoricalPriceData {
  tradingItemId: bigint;
  pricingDate: Date;
  priceCloseAud: number;
  priceCloseUsd: number;
  sharesOutstanding?: bigint;
  marketCap?: number;
}

export interface IHistoricalPricePort {
  getPriceAt(tradingItemId: bigint, date: Date): Promise<HistoricalPrice | null>;
  getLastPriceBefore(tradingItemId: bigint, date: Date): Promise<HistoricalPrice | null>;
  getPricesInRange(
    tradingItemIds: bigint[],
    startDate: Date,
    endDate: Date,
  ): Promise<HistoricalPrice[]>;
  bulkUpsert(data: UpsertHistoricalPriceData[]): Promise<void>;
}
