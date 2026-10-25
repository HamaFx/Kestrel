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

// SPDX-License-Identifier: Apache-2.0

// Optional cross-instance Redis mirror for packet-cache entries. The mirror is
// enabled lazily when `REDIS_URL` is set and `ioredis` is importable; a missing
// package degrades the cache to the in-process LRU only.

import { pclog } from './log';

/** Redis mirror handle — populated lazily when REDIS_URL is set. */
export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
};
let redis: RedisLike | null = null;
let redisAttempted = false;
let redisBroken = false;

export async function getRedisMirror(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL;
  if (!url || redisBroken) return null;
  if (redis) return redis;
  if (redisAttempted) return null;
  redisAttempted = true;
  try {
    // ioredis is optional infrastructure (docker-compose.observability.yml);
    // a missing package degrades the cache to in-process only. The non-literal
    // specifier keeps this a genuinely optional dependency for tsc too.
    const moduleId = 'ioredis' as string;
    const mod = (await import(moduleId)) as unknown as {
      default: new (
        url: string,
        opts: { lazyConnect: boolean; maxRetriesPerRequest: number },
      ) => RedisLike;
    };
    const client = new mod.default(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis = client;
    pclog.info('Packet cache Redis mirror enabled');
    return redis;
  } catch (error) {
    redisBroken = true;
    pclog.warn('Packet cache Redis mirror unavailable; using in-process LRU only', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Test helper — forget the resolved mirror so the next call re-reads REDIS_URL. */
export function resetRedisMirrorState(): void {
  redis = null;
  redisAttempted = false;
  redisBroken = false;
}
