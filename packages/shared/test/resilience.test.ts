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

import { bestEffort, err, isErr, isOk, ok, safeParseJson } from '../src/resilience';

describe('resilience primitives', () => {
  it('returns typed fallback on malformed JSON without throwing', () => {
    expect(safeParseJson('{corrupt', { valid: false })).toEqual({ valid: false });
    expect(safeParseJson(null, ['fallback'])).toEqual(['fallback']);
  });

  it('parses valid JSON and preserves null values', () => {
    expect(safeParseJson('{"total":2}', { total: 0 })).toEqual({ total: 2 });
    expect(safeParseJson<null>('null', { total: 0 } as never)).toBeNull();
  });

  it('captures operational errors via onError and returns fallback in bestEffort', async () => {
    const onError = vi.fn();
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const result = await bestEffort(
      async () => {
        throw new Error('redis_timeout');
      },
      { operation: 'cache_warmup', fallback: 'skipped', onError, logger },
    );
    expect(result).toBe('skipped');
    expect(onError).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      { operation: 'cache_warmup', error: 'redis_timeout' },
      'warn',
    );
  });

  it('returns the operation value when bestEffort succeeds', async () => {
    await expect(bestEffort(() => 42, { operation: 'prefetch', fallback: 0 })).resolves.toBe(42);
  });

  it('narrows ok and err results', () => {
    const success = ok({ id: 'a' });
    const failure = err(new Error('nope'));

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isErr(failure)).toBe(true);
    if (isErr(failure)) expect(failure.error.message).toBe('nope');
  });
});
