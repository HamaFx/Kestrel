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

const mockStore = new Map<string, string>();
const mockTags = new Map<string, Set<string>>();

const mockRedisClient = {
  isOpen: true,
  connect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  get: vi.fn(async (key: string) => mockStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: string, _opts?: { PX?: number }) => {
    mockStore.set(key, value);
    return 'OK';
  }),
  del: vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) mockStore.delete(k);
    return list.length;
  }),
  sAdd: vi.fn(async (tagKey: string, key: string) => {
    let s = mockTags.get(tagKey);
    if (!s) {
      s = new Set();
      mockTags.set(tagKey, s);
    }
    s.add(key);
    return 1;
  }),
  sMembers: vi.fn(async (tagKey: string) => Array.from(mockTags.get(tagKey) ?? [])),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

import { RedisCache } from '../src/cache/redis';

describe('RedisCache — SWR soft-TTL and key expiration (F-09)', () => {
  let cache: RedisCache;

  beforeEach(() => {
    mockStore.clear();
    mockTags.clear();
    vi.clearAllMocks();
    cache = new RedisCache({ url: 'redis://mock:6379', keyPrefix: 'test:' });
  });

  it('serves fresh cached value within soft TTL without calling producer', async () => {
    let producerCalls = 0;
    const producer = async () => {
      producerCalls += 1;
      return 'val-1';
    };

    const first = await cache.fetchWithMeta('k1', producer, { ttlSeconds: 10, maxStaleSeconds: 30 });
    expect(first.value).toBe('val-1');
    expect(first.meta.stale).toBe(false);
    expect(producerCalls).toBe(1);

    // Second call within soft TTL
    const second = await cache.fetchWithMeta('k1', producer, { ttlSeconds: 10, maxStaleSeconds: 30 });
    expect(second.value).toBe('val-1');
    expect(second.meta.stale).toBe(false);
    expect(producerCalls).toBe(1);
  });

  it('calls producer when soft TTL expires, returning fresh value when producer succeeds', async () => {
    // Seed an entry where soft TTL expired 5s ago, but hard ceiling is still valid
    const now = Date.now();
    const expiredEntry = {
      v: 'old-val',
      p: now - 15_000,
      e: now - 5_000, // expired 5s ago
      h: now + 25_000, // hard ceiling still valid for 25s
      t: [],
    };
    mockStore.set('test:k2', JSON.stringify(expiredEntry));

    let producerCalls = 0;
    const result = await cache.fetchWithMeta(
      'k2',
      async () => {
        producerCalls += 1;
        return 'fresh-val';
      },
      { ttlSeconds: 10, maxStaleSeconds: 30 },
    );

    expect(producerCalls).toBe(1);
    expect(result.value).toBe('fresh-val');
    expect(result.meta.stale).toBe(false);
  });

  it('falls back to stale value with stale: true when soft TTL expired and producer throws', async () => {
    const now = Date.now();
    const expiredEntry = {
      v: 'stale-fallback',
      p: now - 15_000,
      e: now - 5_000,
      h: now + 25_000,
      t: [],
    };
    mockStore.set('test:k3', JSON.stringify(expiredEntry));

    const result = await cache.fetchWithMeta(
      'k3',
      async () => {
        throw new Error('upstream failure');
      },
      { ttlSeconds: 10, maxStaleSeconds: 30 },
    );

    expect(result.value).toBe('stale-fallback');
    expect(result.meta.stale).toBe(true);
  });

  it('passes PX expiration option to client.set', async () => {
    await cache.fetchWithMeta('k4', async () => 'hello', { ttlSeconds: 5, maxStaleSeconds: 15 });

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'test:k4',
      expect.any(String),
      expect.objectContaining({ PX: expect.any(Number) }),
    );
  });

  it('getWithMeta correctly marks stale entries when past soft TTL', async () => {
    const now = Date.now();
    const expiredEntry = {
      v: 'older',
      p: now - 12_000,
      e: now - 2_000,
      h: now + 20_000,
      t: [],
    };
    mockStore.set('test:k5', JSON.stringify(expiredEntry));

    const meta = await cache.getWithMeta('k5');
    expect(meta).not.toBeNull();
    expect(meta?.value).toBe('older');
    expect(meta?.meta.stale).toBe(true);
  });
});
