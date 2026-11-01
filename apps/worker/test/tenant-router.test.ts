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

// R16 (audit 2026-10-31) — worker tenant partitioning. The bucket contract is
// pinned with fixture values so the identical copy in
// `apps/web/src/lib/services/worker-partition.ts` (used by the web cron
// alerts route) cannot drift without failing a test on one side.

import { afterEach, describe, expect, it } from 'vitest';

import { filterMyTenants, TenantRouter } from '../src/tenant-router';

describe('TenantRouter bucket contract', () => {
  // md5(tenantId) read as a big-endian uint32, modulo the partition count.
  const FIXTURES: Array<[string, number, number]> = [
    // id, mod 2, mod 3
    ['user-1', 1, 0],
    ['user-2', 0, 0],
    ['tenant-a', 0, 1],
    ['tenant-b', 1, 1],
    ['tenant-c', 1, 1],
    ['tenant-d', 1, 1],
  ];

  it('assigns each tenant to the pinned bucket', () => {
    const two = new TenantRouter({ partition: 0, totalPartitions: 2 });
    const three = new TenantRouter({ partition: 0, totalPartitions: 3 });
    for (const [id, mod2, mod3] of FIXTURES) {
      expect(two.tenantBucket(id), `${id} mod 2`).toBe(mod2);
      expect(three.tenantBucket(id), `${id} mod 3`).toBe(mod3);
    }
  });

  it('rejects a partition outside the total', () => {
    expect(() => new TenantRouter({ partition: 4, totalPartitions: 4 })).toThrow(
      /WORKER_PARTITION \(4\) must be < WORKER_PARTITIONS_TOTAL \(4\)/,
    );
  });

  describe('without partitioning configured', () => {
    const savedPartition = process.env['WORKER_PARTITION'];
    const savedTotal = process.env['WORKER_PARTITIONS_TOTAL'];

    afterEach(() => {
      if (savedPartition === undefined) delete process.env['WORKER_PARTITION'];
      else process.env['WORKER_PARTITION'] = savedPartition;
      if (savedTotal === undefined) delete process.env['WORKER_PARTITIONS_TOTAL'];
      else process.env['WORKER_PARTITIONS_TOTAL'] = savedTotal;
    });

    it('owns every tenant when no partition env is set', () => {
      delete process.env['WORKER_PARTITION'];
      delete process.env['WORKER_PARTITIONS_TOTAL'];
      const router = new TenantRouter();
      expect(router.isSingleWorker).toBe(true);
      expect(router.isMyTenant('user-1')).toBe(true);
    });
  });
});

describe('filterMyTenants (R16)', () => {
  const rows = [
    { tenantId: 'user-1', userId: 'user-1' },
    { tenantId: 'user-2', userId: 'user-2' },
    { tenantId: 'tenant-a', userId: 'u3' },
    { tenantId: 'tenant-b', userId: 'u4' },
  ];

  it('keeps only the rows this partition owns', () => {
    const partitionOne = new TenantRouter({ partition: 1, totalPartitions: 2 });
    const mine = filterMyTenants(rows, partitionOne);
    expect(mine.map((row) => row.tenantId)).toEqual(['user-1', 'tenant-b']);
  });

  it('covers every row exactly once across the partitions', () => {
    const partitions = [0, 1, 2].map(
      (partition) => new TenantRouter({ partition, totalPartitions: 3 }),
    );
    const covered = partitions.flatMap((router) =>
      filterMyTenants(rows, router).map((row) => row.tenantId),
    );
    expect(covered.sort()).toEqual(rows.map((row) => row.tenantId).sort());
    expect(new Set(covered).size).toBe(rows.length);
  });
});
