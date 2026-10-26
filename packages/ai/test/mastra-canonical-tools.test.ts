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

// B-01 (audit 2026-10-18, I-03) — native canonical tool registrations.
// The Mastra-native tools and the legacy AI SDK shims must produce the same
// output for the same input, so the migration cannot change what the model
// (or any non-Mastra consumer) sees.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertCanonicalToolAllowlist,
  CANONICAL_READ_ONLY_TOOL_NAMES,
} from '../src/mastra-v2/agents/canonical';
import { manifestToolNames } from '../src/mastra-v2/capabilities';
import {
  canonicalCandlesTool,
  canonicalCoTTool,
  canonicalIndicatorsTool,
  canonicalKnowledgeTool,
  canonicalMarketStructureTool,
  canonicalNewsTool,
  canonicalPriceTool,
  nativeCanonicalTools,
  resolveNativeCanonicalTool,
} from '../src/mastra-v2/tools/canonical';
import { registerAllTools, toolRegistry } from '../src/tools';
import { getCandlesTool } from '../src/tools/get-candles';
import { getIndicatorsTool } from '../src/tools/get-indicators';
import { getPriceTool } from '../src/tools/get-price';
import { searchKnowledgeTool } from '../src/tools/search-knowledge';

const dataMocks = vi.hoisted(() => ({
  getPrice: vi.fn(),
  getCandles: vi.fn(),
}));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getPrice: dataMocks.getPrice, getCandles: dataMocks.getCandles };
});

const requestContext = {
  get: (key: string) =>
    ({ userId: 'user-1', runId: 'run-1', threadId: 'thread-1' })[
      key as 'userId' | 'runId' | 'threadId'
    ],
};

const toolContext = { requestContext, toolCallId: 'call-1' };

const tick = {
  symbol: 'XAUUSD',
  bid: 2648.2,
  ask: 2648.4,
  mid: 2648.3,
  ts: 1_760_000_000_000,
  source: 'biquote',
};

const candles = Array.from({ length: 40 }, (_, index) => ({
  symbol: 'XAUUSD',
  tf: '1h' as const,
  t: 1_760_000_000_000 + index * 3_600_000,
  o: 2647 + index * 0.1,
  h: 2649 + index * 0.1,
  l: 2645 + index * 0.1,
  c: 2648 + index * 0.1,
  v: 100 + index,
  source: 'biquote',
  fetchedAt: 1_760_000_000_000 + index * 3_600_000,
}));

type AnyTool = { execute: (input: unknown, ctx: unknown) => Promise<unknown> };
const asAnyTool = (tool: unknown): AnyTool => tool as AnyTool;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('native canonical tools (B-01)', () => {
  it('registers the migrated names and resolves them natively', () => {
    expect(resolveNativeCanonicalTool('get_price')).toBe(canonicalPriceTool);
    expect(resolveNativeCanonicalTool('get_candles')).toBe(canonicalCandlesTool);
    expect(resolveNativeCanonicalTool('get_indicators')).toBe(canonicalIndicatorsTool);
    expect(resolveNativeCanonicalTool('search_knowledge')).toBe(canonicalKnowledgeTool);
    expect(resolveNativeCanonicalTool('get_news')).toBe(canonicalNewsTool);
    expect(resolveNativeCanonicalTool('get_cot')).toBe(canonicalCoTTool);
    expect(resolveNativeCanonicalTool('get_market_structure')).toBe(canonicalMarketStructureTool);
    expect(resolveNativeCanonicalTool('get_calendar')).toBeNull();
    expect(Object.keys(nativeCanonicalTools()).sort()).toEqual([
      'get_candles',
      'get_cot',
      'get_indicators',
      'get_market_structure',
      'get_news',
      'get_price',
      'search_knowledge',
    ]);
  });

  it('keeps Mastra tool ids and legacy tool names aligned', () => {
    expect((canonicalPriceTool as { id?: string }).id).toBe('kestrel-get_price');
    expect((canonicalCandlesTool as { id?: string }).id).toBe('kestrel-get_candles');
    expect((canonicalIndicatorsTool as { id?: string }).id).toBe('kestrel-get_indicators');
    expect((canonicalKnowledgeTool as { id?: string }).id).toBe('kestrel-search_knowledge');
    expect((canonicalNewsTool as { id?: string }).id).toBe('kestrel-get_news');
    expect((canonicalCoTTool as { id?: string }).id).toBe('kestrel-get_cot');
    expect((canonicalMarketStructureTool as { id?: string }).id).toBe(
      'kestrel-get_market_structure',
    );
  });

  it('native get_price produces the same output as the legacy AI SDK shim', async () => {
    dataMocks.getPrice.mockResolvedValue(tick);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    try {
      const nativeOutput = (await asAnyTool(canonicalPriceTool).execute(
        { symbols: ['XAUUSD'] },
        toolContext,
      )) as { ticks: (typeof tick)[]; asOf: string };
      const legacyOutput = await asAnyTool(getPriceTool).execute({ symbols: ['XAUUSD'] }, {});

      expect(nativeOutput).toEqual(legacyOutput);
      expect(nativeOutput.ticks[0]?.mid).toBe(2648.3);
      expect(nativeOutput.asOf).toBe('2026-10-18T12:00:00.000Z');
      expect(dataMocks.getPrice).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('native get_candles preserves the legacy period-summary output shape', async () => {
    dataMocks.getCandles.mockResolvedValue(candles);

    const nativeOutput = (await asAnyTool(canonicalCandlesTool).execute(
      { symbol: 'XAUUSD', tf: '1h', count: 120 },
      toolContext,
    )) as { summary: Record<string, unknown> | null; candles: unknown[] };
    const legacyOutput = await asAnyTool(getCandlesTool).execute(
      { symbol: 'XAUUSD', tf: '1h', count: 120 },
      {},
    );

    expect(nativeOutput).toEqual(legacyOutput);
    expect(nativeOutput.candles).toHaveLength(30);
    expect(nativeOutput.summary).toMatchObject({
      open: 2647,
      high: 2652.9,
      low: 2645,
      close: 2651.9,
      totalVolume: 4780,
    });
  });

  it('native get_indicators returns the same series as the legacy shim', async () => {
    dataMocks.getCandles.mockResolvedValue(candles);

    const input = {
      symbol: 'XAUUSD',
      tf: '1h',
      count: 200,
      indicators: [{ kind: 'rsi', params: { period: 14 } }],
    };
    // `computeIndicator` stamps `fetchedAt` with the wall clock; freeze it so
    // the two executions are byte-identical.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    try {
      const nativeOutput = await asAnyTool(canonicalIndicatorsTool).execute(input, toolContext);
      const legacyOutput = await asAnyTool(getIndicatorsTool).execute(input, {});

      expect(nativeOutput).toEqual(legacyOutput);
      const results = (nativeOutput as { results: Array<{ values: number[] }> }).results;
      expect(results[0]?.values.length).toBeGreaterThan(0);
      expect(results[0]?.values.length).toBeLessThanOrEqual(15);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the knowledge schemas identical between native and legacy registrations', () => {
    // The native and shim registrations must accept exactly the same inputs;
    // the shim re-exports the native schema object, so identity is the proof.
    expect((canonicalKnowledgeTool as { inputSchema?: unknown }).inputSchema).toBe(
      (searchKnowledgeTool as { inputSchema?: unknown }).inputSchema,
    );
    expect((canonicalPriceTool as { description?: string }).description).toBe(
      (getPriceTool as { description?: string }).description,
    );
  });

  it('freezes and asserts the canonical read-only allowlist against the registry (B-11)', () => {
    // The manifest allowlist is frozen at module init and every name must
    // resolve in the legacy registry — a manifest typo fails here, not on the
    // first user call that happens to select the missing tool.
    expect(Object.isFrozen(CANONICAL_READ_ONLY_TOOL_NAMES)).toBe(true);
    expect([...CANONICAL_READ_ONLY_TOOL_NAMES]).toEqual([...manifestToolNames('canonical-chat')]);
    expect(() => assertCanonicalToolAllowlist()).not.toThrow();

    registerAllTools(toolRegistry);
    for (const name of CANONICAL_READ_ONLY_TOOL_NAMES) {
      expect(toolRegistry.has(name), `unregistered canonical tool: ${name}`).toBe(true);
    }
  });
});
