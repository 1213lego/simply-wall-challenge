import type { IHistoricalPricePort, UpsertHistoricalPriceData } from '../ports/historical-price.port';
import { PrismaClient } from '@prisma/client';

export interface CsvRow {
  COMPANY_ID: string;
  UNIQUE_SYMBOL: string;
  TICKER_SYMBOL: string;
  COMPANY_NAME: string;
  EXCHANGE_SYMBOL: string;
  EXCHANGE_COUNTRY_ISO: string;
  PRIMARY_INDUSTRY_ID: string;
  TRADING_ITEM_ID: string;
  PRICING_DATE: string;
  PRICE_CLOSE: string;
  PRICE_CLOSE_USD: string;
  SHARES_OUTSTANDING: string;
  MARKET_CAP: string;
}

export class StockLoaderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly historicalPricePort: IHistoricalPricePort,
  ) {}

  async loadBatch(rows: CsvRow[]): Promise<void> {
    if (rows.length === 0) return;

    // Upsert companies
    const companyMap = new Map<string, { id: string; name: string; primaryIndustryId: number }>();
    for (const row of rows) {
      if (!companyMap.has(row.COMPANY_ID)) {
        companyMap.set(row.COMPANY_ID, {
          id: row.COMPANY_ID,
          name: row.COMPANY_NAME,
          primaryIndustryId: parseInt(row.PRIMARY_INDUSTRY_ID, 10),
        });
      }
    }

    await this.prisma.$transaction(
      [...companyMap.values()].map((c) =>
        this.prisma.company.upsert({
          where: { id: c.id },
          create: c,
          update: { name: c.name, primaryIndustryId: c.primaryIndustryId },
        }),
      ),
    );

    // Upsert trading items
    const tradingItemMap = new Map<
      string,
      {
        id: bigint;
        companyId: string;
        exchangeSymbol: string;
        tickerSymbol: string;
        exchangeCountryIso: string;
      }
    >();

    for (const row of rows) {
      const id = BigInt(row.TRADING_ITEM_ID);
      const key = row.TRADING_ITEM_ID;
      if (!tradingItemMap.has(key)) {
        tradingItemMap.set(key, {
          id,
          companyId: row.COMPANY_ID,
          exchangeSymbol: row.EXCHANGE_SYMBOL,
          tickerSymbol: row.TICKER_SYMBOL,
          exchangeCountryIso: row.EXCHANGE_COUNTRY_ISO,
        });
      }
    }

    await this.prisma.$transaction(
      [...tradingItemMap.values()].map((ti) =>
        this.prisma.tradingItem.upsert({
          where: { id: ti.id },
          create: ti,
          update: {
            exchangeSymbol: ti.exchangeSymbol,
            tickerSymbol: ti.tickerSymbol,
            exchangeCountryIso: ti.exchangeCountryIso,
          },
        }),
      ),
    );

    // Bulk upsert historical prices
    const priceData: UpsertHistoricalPriceData[] = rows.map((row) => ({
      tradingItemId: BigInt(row.TRADING_ITEM_ID),
      pricingDate: new Date(row.PRICING_DATE),
      priceCloseAud: parseFloat(row.PRICE_CLOSE),
      priceCloseUsd: parseFloat(row.PRICE_CLOSE_USD),
      sharesOutstanding: row.SHARES_OUTSTANDING ? BigInt(row.SHARES_OUTSTANDING) : undefined,
      marketCap: row.MARKET_CAP ? parseFloat(row.MARKET_CAP) : undefined,
    }));

    await this.historicalPricePort.bulkUpsert(priceData);
  }
}
