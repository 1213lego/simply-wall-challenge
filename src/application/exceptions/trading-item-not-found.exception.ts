export class TradingItemNotFoundException extends Error {
  constructor(symbol: string) {
    super(`Trading item not found: ${symbol}`);
    this.name = 'TradingItemNotFoundException';
  }
}
