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

// Queue payload parsing and error classification.

import type { FullAnalysisQueueRow } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import {
  FullAnalysisCancelledError,
  FullAnalysisPayloadSchema,
  type FullAnalysisPayload,
} from './full-analysis-types';

export const flog = createCategorizedLogger('ai', { component: 'mastra:full-analysis' });

export function parsePayload(value: unknown): FullAnalysisPayload {
  const parsed = FullAnalysisPayloadSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid Full-analysis payload: ${parsed.error.message}`);
  return parsed.data;
}

export function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isLeaseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: unknown }).code === 'FULL_ANALYSIS_QUEUE_OWNERSHIP_LOST' ||
      (error as { code?: unknown }).code === 'FULL_ANALYSIS_LEASE_LOST')
  );
}

/**
 * Cancellation can surface either as our own `FullAnalysisCancelledError` or as
 * the DB-layer queue-cancelled error (e.g. a progress write racing the user's
 * cancel). Both must classify as cancellation, never as lease loss (P2-05).
 */
export function isFullAnalysisCancellation(error: unknown): boolean {
  return (
    error instanceof FullAnalysisCancelledError ||
    (error instanceof Error &&
      ((error as { code?: unknown }).code === 'FULL_ANALYSIS_QUEUE_CANCELLED' ||
        (error as { code?: unknown }).code === 'FULL_ANALYSIS_CANCELLED'))
  );
}

export function payloadFromRow(row: FullAnalysisQueueRow): FullAnalysisPayload | null {
  try {
    return parsePayload(row.payload);
  } catch (error) {
    flog.error('Full-analysis queue payload is invalid', {
      runId: row.runId,
      error: serializeError(error),
    });
    return null;
  }
}
