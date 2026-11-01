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

/* eslint-disable @typescript-eslint/no-explicit-any */
// R13 (audit 2026-10-31): model-supplied journal levels are bounded against
// the live market before the draft can be confirmed or the tool can write.
// These tests drive the two consumers (mutation extractor + log_journal tool)
// through: far-out rejection, a legitimate wide stop, and the fail-closed
// market-data-unavailable path that keeps the draft.

import type * as KestrelData from '@kestrel/data';
import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractMutationInput,
  MutationExtractionError,
} from '../src/mastra-v2/mutation/mutation-extract';
import { createToolContext, withToolContext } from '../src/runtime/tool-context';
import { logJournalTool } from '../src/tools/log-journal';

const mockGetPrice = vi.hoisted(() => vi.fn());
const mockRunStructured = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({ createEntryMock: vi.fn() }));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return {
    ...actual,
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
  };
});

vi.mock('../src/mastra-v2/agents/xauusd/text-runner', () => ({
  runMastraStructured: (...args: unknown[]) => mockRunStructured(...args),
}));

vi.mock('../src/journal/persistence', () => ({
  createEntry: mocks.createEntryMock,
}));

function quote(mid: number) {
  return {
    tick: { symbol: 'XAUUSD', bid: mid - 0.1, ask: mid + 0.1, mid, ts: Date.now(), source: 'test' },
    stale: false,
    producedAt: Date.now(),
    ageMs: 0,
  };
}

function journalExtraction(entry: number, stop?: number) {
  return {
    symbol: 'XAUUSD',
    side: 'long' as const,
    entry,
    ...(stop !== undefined ? { stop } : {}),
    outcome: 'open' as const,
    tags: [],
  };
}

const model = {} as LanguageModel;

describe('extractMutationInput level bounds', () => {
  beforeEach(() => {
    mockGetPrice.mockReset();
    mockRunStructured.mockReset();
  });

  it('rejects a level far outside the band with a user-facing reason and keeps the draft', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));
    mockRunStructured.mockResolvedValue({
      object: journalExtraction(999_999, 3900),
      text: '',
      inputTokens: 10,
      outputTokens: 10,
    });

    const error = await extractMutationInput({
      kind: 'log_journal',
      text: 'Journal: I went long XAUUSD at 999999, stop 3900.',
      model,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MutationExtractionError);
    const extractionError = error as MutationExtractionError;
    expect(extractionError.reason).toBe('level_out_of_band');
    expect(extractionError.message).toContain('XAUUSD entry 999999.00');
    expect(extractionError.message).toContain('Nothing was saved');
    // The schema-valid draft rides along for a correction/retry; it is never
    // written from the error.
    expect(extractionError.draft).toMatchObject({ kind: 'log_journal', entry: 999_999 });
  });

  it('accepts a legitimate wide stop inside the band', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));
    mockRunStructured.mockResolvedValue({
      object: journalExtraction(4000, 3640),
      text: '',
      inputTokens: 10,
      outputTokens: 10,
    });

    const input = await extractMutationInput({
      kind: 'log_journal',
      text: 'Journal: long XAUUSD at 4000, wide stop 3640.',
      model,
    });

    expect(input).toMatchObject({ kind: 'log_journal', symbol: 'XAUUSD', entry: 4000, stop: 3640 });
  });

  it('fails closed when market data is unavailable and preserves the draft', async () => {
    mockGetPrice.mockRejectedValue(new Error('provider down'));
    mockRunStructured.mockResolvedValue({
      object: journalExtraction(4000, 3900),
      text: '',
      inputTokens: 10,
      outputTokens: 10,
    });

    const error = await extractMutationInput({
      kind: 'log_journal',
      text: 'Journal: long XAUUSD at 4000, stop 3900.',
      model,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MutationExtractionError);
    const extractionError = error as MutationExtractionError;
    expect(extractionError.reason).toBe('market_data_unavailable');
    expect(extractionError.message).toContain('market data is unavailable');
    expect(extractionError.message).toContain('Nothing was saved');
    expect(extractionError.draft).toMatchObject({ kind: 'log_journal', entry: 4000, stop: 3900 });
  });

  it('bounds alert levels with the wider alert band', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));
    mockRunStructured.mockResolvedValue({
      object: {
        rule: { type: 'priceCross', symbol: 'XAUUSD', level: 999_999, direction: 'above' },
        channels: ['email'],
      },
      text: '',
      inputTokens: 10,
      outputTokens: 10,
    });

    const error = await extractMutationInput({
      kind: 'set_alert',
      text: 'Alert me when XAUUSD is above 999999.',
      model,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MutationExtractionError);
    expect((error as MutationExtractionError).reason).toBe('level_out_of_band');
    expect((error as MutationExtractionError).message).toContain('level 999999.00');
  });
});

describe('log_journal tool level bounds', () => {
  const context = () =>
    createToolContext({
      threadId: 'thread-1',
      userId: 'user-1',
      latestUserMessageText: 'Journal: I shorted XAUUSD at 2392, stop 2398, target 2378.',
      budget: { spent: 0, max: 5 },
    });

  beforeEach(() => {
    mockGetPrice.mockReset();
    mocks.createEntryMock.mockReset();
    mocks.createEntryMock.mockResolvedValue({ id: 'entry_123' });
  });

  it('refuses to write a level far outside the band and never calls createEntry', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));

    const error = await withToolContext(context(), () =>
      Promise.resolve(
        logJournalTool.execute!(
          { symbol: 'XAUUSD', side: 'short', entry: 999_999, stop: 4000 },
          {} as any,
        ),
      ),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'VALIDATION' });
    expect((error as Error).message).toContain('Journal entry not saved');
    expect((error as Error).message).toContain('entry 999999.00');
    expect(mocks.createEntryMock).not.toHaveBeenCalled();
  });

  it('writes a legitimate wide stop once the levels are verified', async () => {
    mockGetPrice.mockResolvedValue(quote(4000));

    const result = await withToolContext(context(), () =>
      Promise.resolve(
        logJournalTool.execute!(
          { symbol: 'XAUUSD', side: 'short', entry: 4000, stop: 4360, target: 3700 },
          {} as any,
        ),
      ),
    );

    expect(result).toMatchObject({ entryId: 'entry_123' });
    expect(mocks.createEntryMock).toHaveBeenCalledOnce();
  });

  it('fails closed on the write when market data is unavailable', async () => {
    mockGetPrice.mockRejectedValue(new Error('provider down'));

    const error = await withToolContext(context(), () =>
      Promise.resolve(
        logJournalTool.execute!(
          { symbol: 'XAUUSD', side: 'short', entry: 2392, stop: 2398 },
          {} as any,
        ),
      ),
    ).catch((e: unknown) => e);

    expect((error as Error).message).toContain('market data is unavailable');
    expect((error as Error).message).toContain('draft was kept');
    expect(mocks.createEntryMock).not.toHaveBeenCalled();
  });
});
