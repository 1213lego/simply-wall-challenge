-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('buy', 'sell');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "primaryIndustryId" INTEGER NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_items" (
    "id" BIGINT NOT NULL,
    "companyId" UUID NOT NULL,
    "exchangeSymbol" VARCHAR(10) NOT NULL,
    "tickerSymbol" VARCHAR(20) NOT NULL,
    "exchangeCountryIso" VARCHAR(2) NOT NULL,

    CONSTRAINT "trading_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_prices" (
    "id" UUID NOT NULL,
    "tradingItemId" BIGINT NOT NULL,
    "pricingDate" TIMESTAMPTZ NOT NULL,
    "priceCloseAud" DECIMAL(18,6) NOT NULL,
    "priceCloseUsd" DECIMAL(24,12) NOT NULL,
    "sharesOutstanding" BIGINT,
    "marketCap" DECIMAL(32,12),

    CONSTRAINT "historical_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "tradingItemId" BIGINT NOT NULL,
    "transactionDate" TIMESTAMPTZ NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'AUD',
    "transactionCost" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trading_items_exchangeSymbol_tickerSymbol_key" ON "trading_items"("exchangeSymbol", "tickerSymbol");

-- CreateIndex
CREATE INDEX "historical_prices_tradingItemId_pricingDate_idx" ON "historical_prices"("tradingItemId", "pricingDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "historical_prices_tradingItemId_pricingDate_key" ON "historical_prices"("tradingItemId", "pricingDate");

-- CreateIndex
CREATE INDEX "transactions_portfolioId_transactionDate_idx" ON "transactions"("portfolioId", "transactionDate" DESC);

-- AddForeignKey
ALTER TABLE "trading_items" ADD CONSTRAINT "trading_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_prices" ADD CONSTRAINT "historical_prices_tradingItemId_fkey" FOREIGN KEY ("tradingItemId") REFERENCES "trading_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tradingItemId_fkey" FOREIGN KEY ("tradingItemId") REFERENCES "trading_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
