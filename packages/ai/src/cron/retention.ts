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

// Shared retention maintenance used by the worker cron job and the web
// `/api/cron/cleanup-telemetry` fallback: release abandoned AI budget
// reservations, then purge operational tables.

import { runRetentionCleanup, type RetentionResult } from '@kestrel/db';

import { recoverStaleBudgetReservations } from '../budget/budget-reservations';

/** Reservations older than this are considered abandoned by their turn. */
export const RETENTION_RESERVATION_STALE_MS = 15 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 100;

export interface RetentionMaintenanceResult {
  cleanup: RetentionResult;
  budgetRecovery: { scanned: number; released: number; failed: number };
  /** Total rows removed plus budget reservations released. */
  processed: number;
}

export async function runRetentionMaintenance(
  args: {
    signal?: AbortSignal;
  } = {},
): Promise<RetentionMaintenanceResult> {
  const cutoff = new Date(Date.now() - RETENTION_RESERVATION_STALE_MS);
  const budgetRecovery = await recoverStaleBudgetReservations(
    cutoff,
    RECOVERY_BATCH_SIZE,
    args.signal,
  );
  const cleanup = await runRetentionCleanup();
  const deleted = Object.values(cleanup)
    .filter((value): value is number => typeof value === 'number')
    .reduce((sum, value) => sum + value, 0);
  return { cleanup, budgetRecovery, processed: deleted + budgetRecovery.released };
}
