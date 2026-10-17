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

import { classifyStreamError, makeFallbackPart, shouldFallback } from '../src/fallback';

describe('classifyStreamError', () => {
  it.each<{
    label: string;
    input: unknown;
    expectedFallback: boolean;
    expectedReason: string;
  }>([
    // Recoverable errors — the agent retries with the default domain model.
    {
      label: 'plain HTTP 401 object',
      input: { statusCode: 401 },
      expectedFallback: true,
      expectedReason: 'auth',
    },
    {
      label: '403 from the response.status path',
      input: { response: { status: 403 } },
      expectedFallback: true,
      expectedReason: 'auth',
    },
    {
      label: '429 rate limit',
      input: { statusCode: 429 },
      expectedFallback: true,
      expectedReason: 'rate-limit',
    },
    {
      label: '502 upstream failure',
      input: { status: 502 },
      expectedFallback: true,
      expectedReason: 'upstream',
    },
    {
      label: '503 upstream failure',
      input: { status: 503 },
      expectedFallback: true,
      expectedReason: 'upstream',
    },
    {
      label: '504 upstream failure',
      input: { status: 504 },
      expectedFallback: true,
      expectedReason: 'upstream',
    },
    {
      label: 'network timeout message',
      input: new Error('Request timed out after 30s'),
      expectedFallback: true,
      expectedReason: 'timeout',
    },
    {
      label: '"Invalid API key" message without a status code',
      input: new Error('Invalid API key provided.'),
      expectedFallback: true,
      expectedReason: 'auth',
    },
    {
      label: 'quota-exhausted message',
      input: new Error('You have exceeded your quota'),
      expectedFallback: true,
      expectedReason: 'rate-limit',
    },
    // Non-recoverable errors — retrying cannot fix these.
    {
      label: '400 bad request',
      input: { statusCode: 400 },
      expectedFallback: false,
      expectedReason: 'hard-error',
    },
    {
      label: '422 unprocessable',
      input: { statusCode: 422 },
      expectedFallback: false,
      expectedReason: 'hard-error',
    },
    {
      label: 'generic Error with no status code',
      input: new Error('something exploded'),
      expectedFallback: false,
      expectedReason: 'unknown',
    },
    { label: 'string error', input: 'boom', expectedFallback: false, expectedReason: 'unknown' },
    { label: 'null', input: null, expectedFallback: false, expectedReason: 'unknown' },
    { label: 'undefined', input: undefined, expectedFallback: false, expectedReason: 'unknown' },
    // Status extraction boundaries.
    {
      label: 'out-of-range status code 99',
      input: { statusCode: 99 },
      expectedFallback: false,
      expectedReason: 'unknown',
    },
    {
      label: 'out-of-range status code 600',
      input: { statusCode: 600 },
      expectedFallback: false,
      expectedReason: 'unknown',
    },
    {
      label: 'statusCode taking precedence over status',
      input: { statusCode: 401, status: 500 },
      expectedFallback: true,
      expectedReason: 'auth',
    },
  ])('classifies $label', ({ input, expectedFallback, expectedReason }) => {
    const decision = classifyStreamError(input);

    expect(decision.fallback).toBe(expectedFallback);
    expect(decision.reason).toBe(expectedReason);
  });
});

describe('shouldFallback — boolean shorthand', () => {
  it('returns true when classifyStreamError.fallback is true', () => {
    expect(shouldFallback({ statusCode: 429 })).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(shouldFallback({ statusCode: 400 })).toBe(false);
  });
});

describe('makeFallbackPart — payload shape', () => {
  it('produces a structured data-fallback part with all fields', () => {
    const decision = classifyStreamError({ statusCode: 401 });
    const part = makeFallbackPart('anthropic:claude-sonnet-4-20250514', decision);
    expect(part).toEqual({
      type: 'data-fallback',
      reason: 'auth',
      override: 'anthropic:claude-sonnet-4-20250514',
      message: expect.stringContaining('API key'),
    });
  });

  it('preserves a custom override string verbatim', () => {
    const decision = classifyStreamError({ statusCode: 429 });
    const part = makeFallbackPart('openai/gpt-4o-mini', decision);
    expect(part.override).toBe('openai/gpt-4o-mini');
    expect(part.reason).toBe('rate-limit');
  });
});
