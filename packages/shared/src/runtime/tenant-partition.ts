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

// PF-23 — deterministic tenant partitioning.
//
// In single-worker deployments, all tenants are processed by one VM. When
// scaling horizontally, each worker claims a subset of tenants to avoid
// duplicated work. A worker's partition is determined by `WORKER_PARTITION`
// and `WORKER_PARTITIONS_TOTAL` — e.g. `WORKER_PARTITION=2
// WORKER_PARTITIONS_TOTAL=4` means "I am partition 2 of 4, processing tenants
// whose ID hash mod 4 == 2".
//
// Assignment is deterministic (`md5(tenantId) mod totalPartitions`), so any
// process — worker jobs, the web `/api/cron/*` fallbacks, plugin jobs — can
// independently decide whether it owns a tenant without coordination.
//
// Node-only (`node:crypto`) and intentionally NOT re-exported from the
// `@kestrel/shared` barrel: import it from `@kestrel/shared/tenant-partition`.

import { createHash } from 'node:crypto';

export class TenantRouter {
  /** 0-based partition index for THIS process (e.g. 0, 1, 2, 3). */
  readonly partition: number;
  /** Total number of partitions configured (e.g. 4). */
  readonly totalPartitions: number;
  /** True when single-worker mode (no actual partitioning). */
  readonly isSingleWorker: boolean;

  constructor(opts?: { partition?: number; totalPartitions?: number }) {
    const rawPartition =
      opts?.partition !== undefined ? String(opts.partition) : process.env.WORKER_PARTITION;
    const rawTotal =
      opts?.totalPartitions !== undefined
        ? String(opts.totalPartitions)
        : process.env.WORKER_PARTITIONS_TOTAL;

    if (!rawPartition || !rawTotal) {
      this.partition = 0;
      this.totalPartitions = 1;
      this.isSingleWorker = true;
    } else {
      this.partition = Math.max(0, parseInt(rawPartition, 10) || 0);
      this.totalPartitions = Math.max(1, parseInt(rawTotal, 10) || 1);
      if (this.partition >= this.totalPartitions) {
        throw new Error(
          `Invalid worker partition config: WORKER_PARTITION (${this.partition}) must be < WORKER_PARTITIONS_TOTAL (${this.totalPartitions})`,
        );
      }
      this.isSingleWorker = false;
    }
  }

  /** Returns true when this process is responsible for the given tenant. */
  isMyTenant(tenantId: string): boolean {
    if (this.isSingleWorker) return true;
    return this.tenantBucket(tenantId) === this.partition;
  }

  /** Partition bucket for a tenant (0 to totalPartitions - 1). */
  tenantBucket(tenantId: string): number {
    if (this.isSingleWorker) return 0;
    const hash = createHash('md5').update(tenantId).digest();
    return hash.readUInt32BE(0) % this.totalPartitions;
  }
}

/** Read the partition config from the environment for this process. */
export function createTenantRouterFromEnv(): TenantRouter {
  return new TenantRouter();
}

/**
 * R16 (audit 2026-10-31) — filter rows carrying a `tenantId` down to this
 * process's partition.
 *
 * Core jobs call `isMyTenant` inline while scanning, but plugin jobs and the
 * plugin tick bus enumerate users across all tenants; without this filter every
 * replica on a multi-worker deployment would run every tenant's paper-trading
 * strategies and briefings.
 */
export function filterMyTenants<T extends { tenantId: string }>(
  rows: readonly T[],
  router: TenantRouter,
): T[] {
  return rows.filter((row) => router.isMyTenant(row.tenantId));
}
