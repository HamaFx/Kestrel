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

// R16 (audit 2026-10-31) — the web cron alerts route filters users through
// the worker's tenant partition. The bucket fixtures are shared with
// `apps/worker/test/tenant-router.test.ts`: the two implementations are
// copies, and these pinned values are the contract between them.

import { describe, expect, it } from 'vitest';

import {
  ownsTenantInPartition,
  resolveWorkerPartition,
  tenantBucket,
} from '@/lib/services/worker-partition';

const FIXTURES: Array<[string, number]> = [
  // id, md5-bucket mod 2
  ['user-1', 1],
  ['user-2', 0],
  ['tenant-a', 0],
  ['tenant-b', 1],
  ['tenant-c', 1],
  ['tenant-d', 1],
];

describe('tenantBucket', () => {
  it('matches the worker TenantRouter bucket contract', () => {
    for (const [id, mod2] of FIXTURES) {
      expect(tenantBucket(id, 2), `${id} mod 2`).toBe(mod2);
    }
  });
});

describe('resolveWorkerPartition', () => {
  it('is a single worker when no partition env is configured', () => {
    const config = resolveWorkerPartition({});
    expect(config).toEqual({ partition: 0, totalPartitions: 1, singleWorker: true });
  });

  it('reads an explicit partition pair', () => {
    const config = resolveWorkerPartition({ WORKER_PARTITION: '1', WORKER_PARTITIONS_TOTAL: '3' });
    expect(config).toEqual({ partition: 1, totalPartitions: 3, singleWorker: false });
  });

  it('fails closed on an invalid partition pair', () => {
    expect(() =>
      resolveWorkerPartition({ WORKER_PARTITION: '4', WORKER_PARTITIONS_TOTAL: '4' }),
    ).toThrow(/WORKER_PARTITION \(4\) must be < WORKER_PARTITIONS_TOTAL \(4\)/);
  });
});

describe('ownsTenantInPartition', () => {
  it('lets an unpartitioned deployment process every user', () => {
    const config = resolveWorkerPartition({});
    for (const [id] of FIXTURES) {
      expect(ownsTenantInPartition(id, config)).toBe(true);
    }
  });

  it('keeps a partitioned route off another partition users', () => {
    const partitionOne = resolveWorkerPartition({
      WORKER_PARTITION: '1',
      WORKER_PARTITIONS_TOTAL: '2',
    });
    expect(
      FIXTURES.filter(([id]) => ownsTenantInPartition(id, partitionOne)).map(([id]) => id),
    ).toEqual(['user-1', 'tenant-b', 'tenant-c', 'tenant-d']);
  });

  it('covers every user exactly once across the partitions', () => {
    const parts = [0, 1, 2].map((partition) =>
      resolveWorkerPartition({
        WORKER_PARTITION: String(partition),
        WORKER_PARTITIONS_TOTAL: '3',
      }),
    );
    const covered = parts.flatMap((config) =>
      FIXTURES.filter(([id]) => ownsTenantInPartition(id, config)).map(([id]) => id),
    );
    expect(covered.sort()).toEqual(FIXTURES.map(([id]) => id).sort());
    expect(new Set(covered).size).toBe(FIXTURES.length);
  });
});
