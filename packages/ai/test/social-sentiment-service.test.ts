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

// F3 — Social Sentiment Service Tests
//
// Tests the sentiment service with and without API key configured,
// and the shared helper functions (scoreToLabel, detectContrarianSignal).

import { detectContrarianSignal, scoreToLabel } from '@kestrel/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resetSentimentService,
  SocialSentimentService,
} from '../src/sentiment/social-sentiment-service';

afterEach(() => {
  resetSentimentService();
  vi.unstubAllGlobals();
});

describe('scoreToLabel', () => {
  it.each([
    [0.6, 'very_bullish'],
    [0.5, 'very_bullish'],
    [0.2, 'bullish'],
    [0.15, 'bullish'],
    [0, 'neutral'],
    [0.1, 'neutral'],
    [-0.1, 'neutral'],
    [-0.15, 'bearish'],
    [-0.2, 'bearish'],
    [-0.5, 'very_bearish'],
    [-0.6, 'very_bearish'],
  ] as const)('maps score %f to %s', (score, label) => {
    expect(scoreToLabel(score)).toBe(label);
  });
});

describe('detectContrarianSignal', () => {
  it.each([
    [80, true, 'contrarian bearish'],
    [75, true, 'contrarian bearish'],
    [74, false, null],
    [50, false, null],
    [26, false, null],
    [25, true, 'contrarian bullish'],
    [20, true, 'contrarian bullish'],
    [null, false, null],
  ] as const)('retailLongPct %s -> signal %s', (retailLongPct, signal, note) => {
    const result = detectContrarianSignal(retailLongPct);
    expect(result.signal).toBe(signal);
    if (note === null) {
      expect(result.note).toBeNull();
    } else {
      expect(result.note).toContain(note);
    }
  });
});

describe('SocialSentimentService', () => {
  it('returns unavailable when no API key is configured', async () => {
    const service = new SocialSentimentService(undefined, undefined);
    expect(service.isAvailable).toBe(false);

    const result = await service.getSentiment('XAUUSD');
    expect(result?.available).toBe(false);
    expect(result?.sentiment).toBe('neutral');
    expect(result?.score).toBe(0);
  });

  it('returns unavailable aggregated sentiment when no API key', async () => {
    const service = new SocialSentimentService(undefined, undefined);
    const result = await service.getAggregatedSentiment('XAUUSD');

    expect(result.overall).toBe('neutral');
    expect(result.overallScore).toBe(0);
    expect(result.contrarianSignal).toBe(false);
    expect(result.sources.every((s) => !s.available)).toBe(true);
  });

  it('is available when API key and URL are configured', () => {
    const service = new SocialSentimentService('test-key', 'https://api.example.com');
    expect(service.isAvailable).toBe(true);
  });

  it('passes the abort signal to the external request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sentiment: 'bullish',
          score: 0.7,
          retailLongPct: 42,
          sampleSize: 100,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new SocialSentimentService('test-key', 'https://sentiment.test');
    const controller = new AbortController();

    await service.getAggregatedSentiment('XAUUSD', controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sentiment.test/sentiment?symbol=XAUUSD',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('does not swallow cancellation as an unavailable-data result', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new SocialSentimentService('test-key', 'https://sentiment.test');
    const controller = new AbortController();
    controller.abort(new Error('turn cancelled'));

    await expect(service.getSentiment('XAUUSD', controller.signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
