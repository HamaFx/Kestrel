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

import { describe, expect, it, vi } from 'vitest';

import type * as clientModule from '../src/client';

const mockExecute = vi.fn();

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof clientModule>();
  return {
    ...actual,
    getDb: vi.fn(() => ({ execute: mockExecute })),
  };
});

describe('withRateLimit with mocked client', () => {
  it('returns { allowed: true } when count <= limit', async () => {
    mockExecute.mockResolvedValue([{ request_count: 3 }]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-1', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
    expect(result.limit).toBe(10);
  });

  it('returns { allowed: false } when count exceeds limit', async () => {
    mockExecute.mockResolvedValue([{ request_count: 15 }]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-2', 'ai_chat', 10);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(15);
  });

  it('handles legacy result row shape ({ rows })', async () => {
    mockExecute.mockResolvedValue({ rows: [{ request_count: 7 }] });
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-3', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(7);
  });

  it('handles empty result from both shapes', async () => {
    mockExecute.mockResolvedValue([]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-4', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('coerces string/bigint count to number', async () => {
    mockExecute.mockResolvedValue([{ request_count: '42' }]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-5', 'ai_chat', 10);
    expect(result.count).toBe(42);
    expect(typeof result.count).toBe('number');
  });
});
