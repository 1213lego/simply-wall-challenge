export interface HistoricalPrice {
  id: string;
  tradingItemId: bigint;
  pricingDate: Date;
  priceCloseAud: number;
  priceCloseUsd: number;
  sharesOutstanding?: bigint;
  marketCap?: number;
}
