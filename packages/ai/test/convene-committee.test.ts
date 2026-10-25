/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SymbolResearchPacket } from '../src/mastra-v2/packets/symbol-research';
import { createToolContext, withToolContext } from '../src/runtime/tool-context';
import { conveneCommitteeTool } from '../src/tools/convene-committee';

// Options the SDK passes to the tool's execute; derived from the tool itself
// so the test stays aligned with the (context-aware) AI SDK v7 signature.
type ConveneToolOptions = Parameters<NonNullable<typeof conveneCommitteeTool.execute>>[1];
const TOOL_CALL_OPTIONS = {
  toolCallId: 'test-call',
  messages: [],
} as unknown as ConveneToolOptions;

const { mockRunMastraMode } = vi.hoisted(() => ({ mockRunMastraMode: vi.fn() }));
vi.mock('../src/mastra-v2/planning/mode-runner', () => ({ runMastraMode: mockRunMastraMode }));

function readyPacket(): SymbolResearchPacket {
  return {
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
  } as unknown as SymbolResearchPacket;
}

interface CommitteeVerdict {
  persona: string;
  verdict: string;
  keyPoints: string[];
}

interface CommitteeResult {
  symbol: string;
  verdicts: CommitteeVerdict[];
  grade: string;
  goNoGo: string;
  consensus: string;
}

describe('convene_committee tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunMastraMode.mockRejectedValue(new Error('no committee model configured'));
  });

  it('throws an error when live market data packet is blocked', async () => {
    const mockPacket = {
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
    } as unknown as SymbolResearchPacket;

    vi.spyOn(
      await import('../src/mastra-v2/packets/packet-cache'),
      'collectSymbolResearchPacketCached',
    ).mockResolvedValueOnce(mockPacket);

    await expect(
      conveneCommitteeTool.execute!(
        {
          symbol: 'XAUUSD',
          side: 'long',
          entry: 2650,
        },
        TOOL_CALL_OPTIONS,
      ),
    ).rejects.toThrow(/Market data unavailable for XAUUSD/);
    expect(mockRunMastraMode).not.toHaveBeenCalled();
  });

  it('generates grounded fallback verdicts when the committee model is unavailable', async () => {
    vi.spyOn(
      await import('../src/mastra-v2/packets/packet-cache'),
      'collectSymbolResearchPacketCached',
    ).mockResolvedValueOnce(readyPacket());

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
          TOOL_CALL_OPTIONS,
        ),
      ),
    )) as unknown as CommitteeResult;

    expect(result.symbol).toBe('XAUUSD');
    expect(result.verdicts).toHaveLength(4);
    expect(result.verdicts.map((v) => v.persona)).toEqual([
      'economist',
      'technician',
      'risk_manager',
      'sentiment',
    ]);
    const technician = result.verdicts.find((v) => v.persona === 'technician');
    expect(technician).toBeDefined();
    expect(technician?.keyPoints[0]).toContain('EMA20 (2648.00) is above EMA50 (2642.00)');
    expect(technician?.keyPoints[0]).toContain('RSI14 at 55.5');
    const sentiment = result.verdicts.find((v) => v.persona === 'sentiment');
    expect(sentiment?.verdict).toBe('neutral');
    // Three of four desks align, no opposition, valid 2R geometry → B/go under
    // the scaled thresholds.
    expect(result.grade).toBe('B');
    expect(result.goNoGo).toBe('go');
    // P2-05: when the LLM committee could not run, the card is explicitly a
    // heuristic review rather than implied model-verified output.
    expect(result.consensus.startsWith('Heuristic review (no LLM) — ')).toBe(true);
    expect(mockRunMastraMode).toHaveBeenCalledTimes(1);
    expect(mockRunMastraMode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '11111111-1111-1111-1111-111111111111',
        threadId: 'thread-test',
        ledger: expect.anything(),
      }),
    );
  });

  it('runs the deterministic committee without a tool context and never starts LLM spend', async () => {
    vi.spyOn(
      await import('../src/mastra-v2/packets/packet-cache'),
      'collectSymbolResearchPacketCached',
    ).mockResolvedValueOnce(readyPacket());

    const result = (await conveneCommitteeTool.execute!(
      {
        symbol: 'XAUUSD',
        side: 'long',
        entry: 2650.2,
        stop: 2638.2,
        target: 2674.2,
      },
      TOOL_CALL_OPTIONS,
    )) as unknown as CommitteeResult;

    expect(result.verdicts).toHaveLength(4);
    expect(result.verdicts.map((v) => v.persona)).toEqual([
      'economist',
      'technician',
      'risk_manager',
      'sentiment',
    ]);
    // P2-05: no tool context means no LLM committee — the consensus must say
    // the review is heuristic.
    expect(result.consensus.startsWith('Heuristic review (no LLM) — ')).toBe(true);
    expect(mockRunMastraMode).not.toHaveBeenCalled();
  });

  it('keeps the LLM consensus text unprefixed when the committee actually ran (P2-05)', async () => {
    vi.spyOn(
      await import('../src/mastra-v2/packets/packet-cache'),
      'collectSymbolResearchPacketCached',
    ).mockResolvedValueOnce(readyPacket());
    mockRunMastraMode.mockResolvedValueOnce({
      agentOpinions: [
        {
          agentName: 'technical',
          bias: 'bullish',
          confidence: 0.7,
          reasoning: 'Structure holds above the 1h EMA stack.',
          rawData: {},
        },
      ],
      finalText: 'The committee leans mildly bullish on structure.',
    });

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
          TOOL_CALL_OPTIONS,
        ),
      ),
    )) as unknown as CommitteeResult;

    expect(result.consensus).toBe('The committee leans mildly bullish on structure.');
    expect(result.consensus).not.toContain('Heuristic review');
  });
});
