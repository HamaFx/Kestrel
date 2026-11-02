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

// R13 (audit 2026-10-31): model-supplied journal and alert levels are bounded
// against the live market before a drafted mutation can be confirmed. These
// tests drive the live extractor through far-out rejection, a legitimate wide
// stop, and the fail-closed market-data-unavailable path that keeps the draft.

import type * as KestrelData from '@kestrel/data';
import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractMutationInput,
  MutationExtractionError,
} from '../src/mastra-v2/mutation/mutation-extract';

const mockGetPrice = vi.hoisted(() => vi.fn());
const mockRunStructured = vi.hoisted(() => vi.fn());

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return {
    ...actual,
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
  };
});

vi.mock('../src/mastra-v2/shared/text-runner', () => ({
  runMastraStructured: (...args: unknown[]) => mockRunStructured(...args),
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
