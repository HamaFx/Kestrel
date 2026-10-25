// SPDX-License-Identifier: Apache-2.0

// Status badge tone, label and failure detail derived from a Mastra run.
import type { BadgeTone } from '@/components/ui/badge';

import type { MastraRun } from './mastra-runs-types';

export function runTone(run: MastraRun): BadgeTone {
  if (run.workflow.status === 'failed' || run.workflow.failedSteps.length > 0) return 'danger';
  if (run.kind?.endsWith('_failed')) return 'danger';
  if (run.workflow.status === 'running' || run.workflow.status === 'pending') return 'warn';
  return 'success';
}

export function runStatusLabel(run: MastraRun): string {
  if (run.workflow.failedSteps.length > 0) return `failed@${run.workflow.failedSteps.join(',')}`;
  if (run.workflow.status) return run.workflow.status;
  if (run.kind?.endsWith('_failed')) return 'failed';
  return 'completed';
}

/**
 * Phase 5.2 — failure detail for failed runs (committee strict failure,
 * verifier findings), recovered from the workflow snapshot server-side.
 */
export function runFailureDetail(run: MastraRun): string | null {
  return run.error ?? run.workflow.error ?? null;
}
