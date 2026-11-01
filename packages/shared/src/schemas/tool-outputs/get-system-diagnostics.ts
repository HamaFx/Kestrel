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

import { z } from 'zod';

export const GetSystemDiagnosticsInputSchema = z.object({
  verbose: z.boolean().default(false),
  forceProbe: z.boolean().default(false),
});

export type GetSystemDiagnosticsInput = z.infer<typeof GetSystemDiagnosticsInputSchema>;

/**
 * Numeric readings here are nullable (R8, audit 2026-10-31): when the count
 * probe fails they are null rather than 0, because 0 would read as a measured
 * "empty table" instead of "could not read the table". `status: 'error'`
 * says which case applies. Previously persisted outputs with numbers still
 * parse.
 */
export const DatabaseStatsSchema = z.object({
  status: z.enum(['connected', 'error']),
  /** Probe round-trip in ms; null when the probe failed. */
  latencyMs: z.number().nullable(),
  journalEntriesCount: z.number().nullable(),
  snapshotsCount: z.number().nullable(),
  briefingsCount: z.number().nullable(),
  resonanceCount: z.number().nullable(),
  memoryEmbeddingsCount: z.number().nullable(),
});

export const WorkerStatsSchema = z.object({
  resonanceSyncLastRun: z.string().nullable(),
  cotSyncLastRun: z.string().nullable(),
  /**
   * Active alerts for the caller. A real count of the `alerts` table (0 is an
   * honest "none"), null when the count could not be read — R8 (audit
   * 2026-10-31). This used to be a hard-coded 0 placeholder.
   */
  activeAlertsCount: z.number().nullable(),
});

export const BudgetStatsSchema = z.object({
  spentUsd: z.number(),
  limitUsd: z.number(),
  remainingUsd: z.number(),
});

export const GetSystemDiagnosticsOutputSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  asOf: z.string(),
  database: DatabaseStatsSchema,
  worker: WorkerStatsSchema,
  budget: BudgetStatsSchema,
  envCheck: z.record(z.string(), z.boolean()),
  narrative: z.string(),
});

export type GetSystemDiagnosticsOutput = z.infer<typeof GetSystemDiagnosticsOutputSchema>;
