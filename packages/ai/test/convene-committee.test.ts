import { describe, expect, it, vi } from 'vitest';

import { conveneCommitteeTool } from '../src/tools/convene-committee';
import { createToolContext, withToolContext } from '../src/tool-context';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';

describe('convene_committee tool', () => {
  it('throws an error when live market data packet is blocked', async () => {
    const mockPacket: any = {
      packetId: 'packet-blocked',
      kind: 'symbol_research_packet',
      generatedAt: new Date().toISOString(),
      symbol: 'XAUUSD',
      status: 'blocked',
      dataQuality: 'degraded',
      warnings: ['Market data feed disconnected'],
      missingData: ['live price'],
      price: null,
      timeframes: [],
      optionalContext: { available: false, reason: 'none' },
    };

    vi.spyOn(await import('../src/mastra-v2/packets/packet-cache'), 'collectSymbolResearchPacketCached')
      .mockResolvedValueOnce(mockPacket);

    await expect(
      conveneCommitteeTool.execute!(
        {
          symbol: 'XAUUSD',
          side: 'long',
          entry: 2650,
        },
        {} as any,
      ),
    ).rejects.toThrow(/Market data unavailable for XAUUSD/);
  });

  it('generates grounded fallback verdicts when market data tick is present', async () => {
    const mockPacket: any = {
      packetId: 'packet-ready',
      kind: 'symbol_research_packet',
      generatedAt: new Date().toISOString(),
      symbol: 'XAUUSD',
      status: 'ready',
      dataQuality: 'complete',
      missingData: [],
      warnings: [],
      price: {
        evidenceId: 'ev-price-1',
        symbol: 'XAUUSD',
        source: 'mock',
        fetchedAt: new Date().toISOString(),
        dataAsOf: new Date().toISOString(),
        freshness: 'fresh',
        quality: 'complete',
        warnings: [],
        tick: {
          symbol: 'XAUUSD',
          bid: 2650.0,
          ask: 2650.4,
          mid: 2650.2,
          ts: Date.now(),
          source: 'mock',
        },
      },
      timeframes: [
        {
          evidenceId: 'ev-1h-1',
          symbol: 'XAUUSD',
          timeframe: '1h',
          source: 'mock',
          fetchedAt: new Date().toISOString(),
          dataAsOf: new Date().toISOString(),
          freshness: 'fresh',
          quality: 'complete',
          warnings: [],
          candles: [
            {
              symbol: 'XAUUSD',
              tf: '1h',
              t: Date.now(),
              o: 2645,
              h: 2655,
              l: 2640,
              c: 2650.2,
              v: 100,
              source: 'mock',
              fetchedAt: Date.now(),
            },
          ],
          indicators: [
            {
              symbol: 'XAUUSD',
              tf: '1h',
              kind: 'ema',
              params: { period: 20 },
              values: [2648.0],
              fetchedAt: Date.now(),
            },
            {
              symbol: 'XAUUSD',
              tf: '1h',
              kind: 'ema',
              params: { period: 50 },
              values: [2642.0],
              fetchedAt: Date.now(),
            },
            {
              symbol: 'XAUUSD',
              tf: '1h',
              kind: 'rsi',
              params: { period: 14 },
              values: [55.5],
              fetchedAt: Date.now(),
            },
            {
              symbol: 'XAUUSD',
              tf: '1h',
              kind: 'atr',
              params: { period: 14 },
              values: [12.0],
              fetchedAt: Date.now(),
            },
          ],
        },
      ],
      optionalContext: { available: true, reason: 'complete' },
    };

    vi.spyOn(await import('../src/mastra-v2/packets/packet-cache'), 'collectSymbolResearchPacketCached')
      .mockResolvedValueOnce(mockPacket);

    const ctx = createToolContext({
      userId: '11111111-1111-1111-1111-111111111111',
      threadId: 'thread-test',
    });

    const result = (await withToolContext(ctx, () =>
      Promise.resolve(
        conveneCommitteeTool.execute!(
          {
            symbol: 'XAUUSD',
            side: 'long',
            entry: 2650.2,
            stop: 2638.2,
            target: 2674.2,
          },
          {} as any,
        ),
      ),
    )) as any;

    expect(result.symbol).toBe('XAUUSD');
    expect(result.verdicts).toHaveLength(3);
    const technician = result.verdicts.find((v: any) => v.persona === 'technician');
    expect(technician).toBeDefined();
    expect(technician?.keyPoints[0]).toContain('EMA20 (2648.00) is above EMA50 (2642.00)');
    expect(technician?.keyPoints[0]).toContain('RSI14 at 55.5');
  });
});
