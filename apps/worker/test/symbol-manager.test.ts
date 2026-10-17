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

// Batch 4: drives the REAL SymbolManager against a mocked `listDistinctSymbols`
// DB boundary. Verifies default fallback, unknown-symbol filtering, the
// added/removed diff math for the aggregate + per-consumer events, the
// unchanged-set no-op, and fail-soft behavior when the poll query throws.

import { DEFAULT_WATCHLIST_SYMBOLS } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { Logger } from '../src/log';
import {
  SymbolManager,
  type PerConsumerChangeEvent,
  type SymbolChangeEvent,
} from '../src/symbol-manager';

const mockListDistinctSymbols = vi.fn();

vi.mock('@kestrel/db', () => ({
  listDistinctSymbols: (...args: unknown[]) => mockListDistinctSymbols(...args),
}));

function mockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => mockLogger()),
    with: vi.fn(() => mockLogger()),
  } as unknown as Logger;
}

interface EventLog {
  symbolsChanged: SymbolChangeEvent[];
  biquoteChanged: PerConsumerChangeEvent[];
  binanceChanged: PerConsumerChangeEvent[];
}

function captureEvents(mgr: SymbolManager): EventLog {
  const events: EventLog = {
    symbolsChanged: [],
    biquoteChanged: [],
    binanceChanged: [],
  };
  mgr.on('symbolsChanged', (e: SymbolChangeEvent) => events.symbolsChanged.push(e));
  mgr.on('biquoteChanged', (e: PerConsumerChangeEvent) => events.biquoteChanged.push(e));
  mgr.on('binanceChanged', (e: PerConsumerChangeEvent) => events.binanceChanged.push(e));
  return events;
}

describe('SymbolManager', () => {
  beforeEach(() => {
    mockListDistinctSymbols.mockReset();
  });

  it('falls back to the default watchlist when user_symbols is empty', async () => {
    mockListDistinctSymbols.mockResolvedValue([]);
    const mgr = new SymbolManager(mockLogger(), 60_000);

    await mgr.start();

    expect(new Set(mgr.getSymbols())).toEqual(new Set(DEFAULT_WATCHLIST_SYMBOLS));
    mgr.stop();
  });

  it('takes valid DB symbols as the active set and filters out unknown symbols', async () => {
    mockListDistinctSymbols.mockResolvedValue(['AUDUSD', 'INVALID_SYM']);
    const mgr = new SymbolManager(mockLogger(), 60_000);

    await mgr.start();

    expect(mgr.getSymbols()).toEqual(['AUDUSD']);
    expect(mgr.getSymbols()).not.toContain('INVALID_SYM');
    mgr.stop();
  });

  it('emits aggregate and per-consumer events with correct added/removed diffs when the set changes', async () => {
    mockListDistinctSymbols.mockResolvedValue(['AUDUSD']);
    const mgr = new SymbolManager(mockLogger(), 60_000);
    const events = captureEvents(mgr);

    await mgr.start();
    mgr.stop();

    // Second poll swaps the active set from [AUDUSD] to the empty-DB defaults.
    mockListDistinctSymbols.mockResolvedValue([]);
    await mgr.start();
    mgr.stop();

    expect(events.symbolsChanged).toEqual([
      { current: ['AUDUSD'], added: ['AUDUSD'], removed: [] },
      {
        current: [...DEFAULT_WATCHLIST_SYMBOLS],
        added: [...DEFAULT_WATCHLIST_SYMBOLS],
        removed: ['AUDUSD'],
      },
    ]);

    expect(events.biquoteChanged).toEqual([
      { symbols: ['AUDUSD'], added: ['AUDUSD'], removed: [] },
      {
        symbols: ['XAUUSD', 'EURUSD', 'GBPUSD'],
        added: ['XAUUSD', 'EURUSD', 'GBPUSD'],
        removed: ['AUDUSD'],
      },
    ]);

    expect(events.binanceChanged).toEqual([
      { symbols: [], added: [], removed: [] },
      { symbols: ['BTCUSDT', 'ETHUSDT'], added: ['BTCUSDT', 'ETHUSDT'], removed: [] },
    ]);
  });

  it('does not emit change events when the poll returns the same symbol set', async () => {
    mockListDistinctSymbols.mockResolvedValue(['AUDUSD']);
    const mgr = new SymbolManager(mockLogger(), 60_000);
    const events = captureEvents(mgr);

    await mgr.start();
    mgr.stop();
    await mgr.start();
    mgr.stop();

    expect(events.symbolsChanged).toHaveLength(1);
    expect(events.biquoteChanged).toHaveLength(1);
    expect(events.binanceChanged).toHaveLength(1);
  });

  it('retains the current symbol list and logs when the DB query throws', async () => {
    mockListDistinctSymbols.mockResolvedValue(['AUDUSD']);
    const log = mockLogger();
    const mgr = new SymbolManager(log, 60_000);

    await mgr.start();
    mgr.stop();

    mockListDistinctSymbols.mockRejectedValue(new Error('DB connection lost'));
    await mgr.start();

    expect(mgr.getSymbols()).toEqual(['AUDUSD']);
    expect(log.error as Mock).toHaveBeenCalledWith(
      'Failed to poll user symbols',
      expect.objectContaining({ err: expect.stringContaining('DB connection lost') }),
    );
    mgr.stop();
  });

  it('does not double-start polling', async () => {
    mockListDistinctSymbols.mockResolvedValue([]);
    const mgr = new SymbolManager(mockLogger(), 60_000);

    await mgr.start();
    await mgr.start();

    expect(mockListDistinctSymbols).toHaveBeenCalledTimes(1);
    mgr.stop();
    mgr.stop();
  });
});
