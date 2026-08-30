import type { Candle, Symbol, Timeframe } from '@kestrel/shared';

import type { MarketDataProvider } from './provider-registry';

/** Deterministic synthetic provider; never performs network or database I/O. */
export const offlineMarketDataProvider: MarketDataProvider = {
  name: 'offline',
  label: 'Offline Synthetic Data',
  pinned: true,
  supports: () => true,
  async fetchPrice(symbol: Symbol) {
    const seed = [...symbol].reduce((total, char) => total + char.charCodeAt(0), 0);
    const price = Number((100 + (seed % 10_000) / 100).toFixed(5));
    return { price, provider: 'offline', ageMs: 0 };
  },
  async fetchCandles(symbol: Symbol, tf: Timeframe, count: number): Promise<Candle[]> {
    const seed = [...symbol].reduce((total, char) => total + char.charCodeAt(0), 0);
    const step = tf === '1m' ? 60_000 : tf === '1h' ? 3_600_000 : 86_400_000;
    // Keep fixtures reproducible across calls and machines. The synthetic
    // provider is used by offline development and acceptance tests, so its
    // candle timestamps must not drift with wall-clock time.
    const now = 1_700_000_000_000 - (1_700_000_000_000 % step);
    const base = 100 + (seed % 10_000) / 100;
    return Array.from({ length: count }, (_, index) => {
      const close = Number((base + ((index * 17 + seed) % 100) / 100).toFixed(5));
      const open = Number((close - 0.1).toFixed(5));
      return {
        symbol,
        tf,
        t: now - (count - index) * step,
        o: open,
        h: Number((close + 0.2).toFixed(5)),
        l: Number((open - 0.1).toFixed(5)),
        c: close,
        v: 1_000 + index,
        source: 'offline',
        fetchedAt: now,
      };
    });
  },
};
