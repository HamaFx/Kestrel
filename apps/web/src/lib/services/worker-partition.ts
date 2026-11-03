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

// R16 (audit 2026-10-31) — worker partition filter for web cron routes.
//
// The worker partitions tenant work with `WORKER_PARTITION` /
// `WORKER_PARTITIONS_TOTAL` (`apps/worker/src/tenant-router.ts`): hash the
// tenant id with md5, take it modulo the partition count. The web cron
// `/api/cron/alerts` route evaluates alerts for every tenant it can read, so
// on a partitioned deployment it would process another partition's users on
// top of the worker that owns them. The route now filters with the same
// algorithm.
//
// This is deliberately a copy of the worker's hash: the web bundle cannot
// import the worker app. Keep the two in sync; both test suites pin the same
// fixture buckets so a drift fails a test on whichever side changed.

import { createHash } from 'node:crypto';

export interface WorkerPartition {
  partition: number;
  totalPartitions: number;
  /** True when no partitioning is configured: this process owns every tenant. */
  singleWorker: boolean;
}

/** Read the partition config from env, matching `TenantRouter`'s semantics. */
export function resolveWorkerPartition(env: NodeJS.ProcessEnv = process.env): WorkerPartition {
  const rawPartition = env['WORKER_PARTITION'];
  const rawTotal = env['WORKER_PARTITIONS_TOTAL'];
  if (!rawPartition || !rawTotal) {
    return { partition: 0, totalPartitions: 1, singleWorker: true };
  }
  const partition = Math.max(0, parseInt(rawPartition, 10) || 0);
  const totalPartitions = Math.max(1, parseInt(rawTotal, 10) || 1);
  if (partition >= totalPartitions) {
    throw new Error(
      `Invalid worker partition config: WORKER_PARTITION (${partition}) must be < WORKER_PARTITIONS_TOTAL (${totalPartitions})`,
    );
  }
  return { partition, totalPartitions, singleWorker: false };
}

/** The partition bucket a tenant belongs to (0 to totalPartitions - 1). */
function tenantBucket(tenantId: string, totalPartitions: number): number {
  const hash = createHash('md5').update(tenantId).digest();
  return hash.readUInt32BE(0) % totalPartitions;
}

/**
 * True when this process may process the given tenant. Always true in
 * single-worker mode, so an unpartitioned deployment is unaffected.
 */
export function ownsTenantInPartition(
  tenantId: string,
  config: WorkerPartition = resolveWorkerPartition(),
): boolean {
  if (config.singleWorker) return true;
  return tenantBucket(tenantId, config.totalPartitions) === config.partition;
}
