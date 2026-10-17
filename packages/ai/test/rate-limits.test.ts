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

import { describe, expect, it } from 'vitest';

import { extractRateLimits, type RateLimitData } from '../src/rate-limits';

const CASES: Array<{
  label: string;
  headers: Record<string, string> | null | undefined;
  expected: Partial<RateLimitData> | undefined;
}> = [
  {
    label: 'parses OpenAI-style rate limit headers',
    headers: {
      'x-ratelimit-remaining-requests': '49',
      'x-ratelimit-remaining-tokens': '50000',
      'x-ratelimit-reset-requests': '1s',
      'x-ratelimit-reset-tokens': '10s',
    },
    expected: {
      remainingRequests: 49,
      remainingTokens: 50000,
      resetRequests: '1s',
      resetTokens: '10s',
    },
  },
  {
    label: 'parses Anthropic-style rate limit headers',
    headers: {
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-tokens-remaining': '8000',
      'anthropic-ratelimit-requests-reset': '2026-06-28T12:00:00Z',
      'anthropic-ratelimit-tokens-reset': '2026-06-28T12:00:00Z',
    },
    expected: {
      remainingRequests: 10,
      remainingTokens: 8000,
      resetRequests: '2026-06-28T12:00:00Z',
      resetTokens: '2026-06-28T12:00:00Z',
    },
  },
  {
    label: 'parses Groq-style headers (same format as OpenAI)',
    headers: {
      'x-ratelimit-remaining-requests': '100',
      'x-ratelimit-remaining-tokens': '6000',
    },
    expected: { remainingRequests: 100, remainingTokens: 6000 },
  },
  {
    label: 'lets Anthropic headers override OpenAI headers when both are present',
    headers: {
      'x-ratelimit-remaining-requests': '50',
      'anthropic-ratelimit-requests-remaining': '10',
    },
    expected: { remainingRequests: 10 },
  },
  {
    label: 'handles mixed case header names (case-insensitive)',
    headers: {
      'X-RateLimit-Remaining-Requests': '99',
      'Anthropic-RateLimit-Requests-Remaining': '5',
    },
    expected: { remainingRequests: 5 },
  },
  {
    label: 'reports NaN numeric fields as undefined',
    headers: { 'x-ratelimit-remaining-requests': 'not-a-number' },
    expected: { remainingRequests: undefined },
  },
  {
    label: 'returns undefined when headers are null',
    headers: null,
    expected: undefined,
  },
  {
    label: 'returns undefined when headers are undefined',
    headers: undefined,
    expected: undefined,
  },
  {
    label: 'returns undefined when no rate limit headers are present',
    headers: { 'content-type': 'application/json' },
    expected: undefined,
  },
  {
    label: 'returns undefined for an empty headers object',
    headers: {},
    expected: undefined,
  },
];

describe('extractRateLimits', () => {
  it.each(CASES)('$label', ({ headers, expected }) => {
    const result = extractRateLimits(headers as Record<string, string> | undefined);

    if (expected === undefined) {
      expect(result).toBeUndefined();
      return;
    }
    expect(result).toBeDefined();
    expect(result).toMatchObject(expected);
  });
});
