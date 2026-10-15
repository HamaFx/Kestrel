import { describe, expect, it, vi } from 'vitest';

import { conveneCommitteeTool } from '../src/tools/convene-committee';
import { createToolContext, withToolContext } from '../src/tool-context';
import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';

describe('convene_committee tool', () => {
  it('throws an error when live market data packet is blocked', async () => {
    const mockPacket: SymbolResearchPacket = {
      packetId: 'packet-blocked',
      asOf: Date.now(),
      symbol: 'XAUUSD',
      status: 'blocked',
      blockReason: 'Market data feed disconnected',
      missingData: ['live price'],
      price: null,
      timeframes: [],
      stats: { totalLatencyMs: 10, totalRequests: 1, failedRequests: 1 },
    };

    vi.spyOn(await import('../src/mastra-v2/packets/packet-cache'), 'collectSymbolResearchPacketCached')
      .mockResolvedValueOnce(mockPacket);

    await expect(
      conveneCommitteeTool.execute({
        symbol: 'XAUUSD',
        side: 'long',
        entry: 2650,
      }),
    ).rejects.toThrow(/Market data unavailable for XAUUSD/);
  });

  it('generates grounded fallback verdicts when market data tick is present', async () => {
    const mockPacket: SymbolResearchPacket = {
      packetId: 'packet-ready',
      asOf: Date.now(),
      symbol: 'XAUUSD',
      status: 'ready',
      missingData: [],
      price: {
        tick: {
          symbol: 'XAUUSD',
          bid: 2650.0,
          ask: 2650.4,
          mid: 2650.2,
          spread: 0.4,
          timestamp: Date.now(),
        },
        session: { high: 2660, low: 2640, changePct: 0.2 },
      },
      timeframes: [
        {
          timeframe: '1h',
          candles: [{ o: 2645, h: 2655, l: 2640, c: 2650.2, v: 100, timestamp: Date.now() }],
          indicators: [
            { kind: 'ema', params: { period: 20 }, values: [2648.0] },
            { kind: 'ema', params: { period: 50 }, values: [2642.0] },
            { kind: 'rsi', params: { period: 14 }, values: [55.5] },
            { kind: 'atr', params: { period: 14 }, values: [12.0] },
          ],
        },
      ],
      stats: { totalLatencyMs: 15, totalRequests: 1, failedRequests: 0 },
    };

    vi.spyOn(await import('../src/mastra-v2/packets/packet-cache'), 'collectSymbolResearchPacketCached')
      .mockResolvedValueOnce(mockPacket);

    const ctx = createToolContext({
      userId: '11111111-1111-1111-1111-111111111111',
      threadId: 'thread-test',
    });

    const result = await withToolContext(ctx, () =>
      conveneCommitteeTool.execute({
        symbol: 'XAUUSD',
        side: 'long',
        entry: 2650.2,
        stop: 2638.2,
        target: 2674.2,
      }),
    );

    expect(result.symbol).toBe('XAUUSD');
    expect(result.verdicts).toHaveLength(3);
    const technician = result.verdicts.find((v) => v.persona === 'technician');
    expect(technician).toBeDefined();
    expect(technician?.keyPoints[0]).toContain('EMA20 (2648.00) is above EMA50 (2642.00)');
    expect(technician?.keyPoints[0]).toContain('RSI14 at 55.5');
  });
});
