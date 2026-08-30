import { describe, expect, it, vi } from 'vitest';

import { offlineMarketDataProvider } from '../src/providers/offline';

describe('offlineMarketDataProvider', () => {
  it('returns deterministic synthetic prices and candles', async () => {
    const firstPrice = await offlineMarketDataProvider.fetchPrice('XAUUSD');
    const secondPrice = await offlineMarketDataProvider.fetchPrice('XAUUSD');
    expect(secondPrice).toEqual(firstPrice);

    const candles = await offlineMarketDataProvider.fetchCandles!('XAUUSD', '1h', 3);
    const repeatedCandles = await offlineMarketDataProvider.fetchCandles!('XAUUSD', '1h', 3);
    expect(candles).toEqual(repeatedCandles);
    expect(candles).toHaveLength(3);
    if (!candles) throw new Error('offline provider returned no candles');
    expect(candles.every((candle) => candle.source === 'offline')).toBe(true);
    expect(candles.map(({ o, h, l, c }) => ({ o, h, l, c }))).toEqual(
      expect.arrayContaining([expect.any(Object)]),
    );
  });

  it('does not perform network requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await offlineMarketDataProvider.fetchPrice('BTCUSDT');
    await offlineMarketDataProvider.fetchCandles!('BTCUSDT', '1h', 2);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
