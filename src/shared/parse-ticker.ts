export interface ParsedTicker {
  exchangeSymbol: string;
  tickerSymbol: string;
}

/**
 * Parses ticker strings in formats:
 *   "ASX:BHP"  → { exchangeSymbol: "ASX", tickerSymbol: "BHP" }
 *   "ASX BHP"  → { exchangeSymbol: "ASX", tickerSymbol: "BHP" }
 *   "ASX.BHP"  → { exchangeSymbol: "ASX", tickerSymbol: "BHP" }
 */
export function parseTicker(ticker: string): ParsedTicker {
  const trimmed = ticker.trim();
  const match = trimmed.match(/^([A-Z]+)[:\s.]([A-Z0-9]+)$/i);

  if (!match) {
    throw new Error(
      `Invalid ticker format: "${ticker}". Expected format: "EXCHANGE:TICKER" (e.g. "ASX:BHP")`,
    );
  }

  return {
    exchangeSymbol: match[1].toUpperCase(),
    tickerSymbol: match[2].toUpperCase(),
  };
}
