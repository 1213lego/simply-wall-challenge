import { describe, it, expect } from 'vitest';
import { parseTicker } from '../../src/shared/parse-ticker';

describe('parseTicker', () => {
  it('parses ASX:BHP format', () => {
    expect(parseTicker('ASX:BHP')).toEqual({ exchangeSymbol: 'ASX', tickerSymbol: 'BHP' });
  });

  it('parses ASX BHP format', () => {
    expect(parseTicker('ASX BHP')).toEqual({ exchangeSymbol: 'ASX', tickerSymbol: 'BHP' });
  });

  it('parses ASX.BHP format', () => {
    expect(parseTicker('ASX.BHP')).toEqual({ exchangeSymbol: 'ASX', tickerSymbol: 'BHP' });
  });

  it('normalizes to uppercase', () => {
    expect(parseTicker('asx:bhp')).toEqual({ exchangeSymbol: 'ASX', tickerSymbol: 'BHP' });
  });

  it('handles tickers with numbers', () => {
    expect(parseTicker('ASX:8CO')).toEqual({ exchangeSymbol: 'ASX', tickerSymbol: '8CO' });
  });

  it('throws for invalid format', () => {
    expect(() => parseTicker('INVALID')).toThrow('Invalid ticker format');
    expect(() => parseTicker('')).toThrow('Invalid ticker format');
  });
});
