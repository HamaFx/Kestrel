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

// Phase 8 — retry semantics by failure category for durable Full-mode runs.
//
// One typed classification and one decision function own the worker's
// requeue/fail/discard behavior so retry policy is testable without a queue.
//
// Categories:
//   lease     — queue ownership was lost; the attempt must be discarded and
//               must neither settle budget nor project any terminal state.
//   quota     — the user's daily budget rejects the run; permanent, terminal.
//   transient — admission/provider infrastructure or model errors that can
//               succeed on a later attempt (bounded by MAX_ANALYSIS_ATTEMPTS).
//   permanent — any other error; cannot succeed on retry.

import { FullAnalysisLeaseLostError } from './full-analysis';

export type FullAnalysisFailureCategory = 'lease' | 'quota' | 'transient' | 'permanent';

/** Daily-budget rejection for one queued run; terminal, never retried. */
export class FullAnalysisQuotaExceededError extends Error {
  readonly code = 'FULL_ANALYSIS_BUDGET_EXCEEDED';
  readonly spent: number;
  readonly max: number;

  constructor(spent: number, max: number) {
    super(`Daily AI budget exceeded ($${spent.toFixed(2)} / $${max.toFixed(2)}).`);
    this.name = 'FullAnalysisQuotaExceededError';
    this.spent = spent;
    this.max = max;
  }
}

/** Reservation-infrastructure failures are retryable admission errors. */
export class FullAnalysisBudgetAdmissionError extends Error {
  readonly code = 'FULL_ANALYSIS_BUDGET_ADMISSION_FAILED';

  constructor(cause: unknown) {
    super('Full-analysis budget admission failed.', { cause });
    this.name = 'FullAnalysisBudgetAdmissionError';
  }
}

const RETRYABLE_ERROR_PATTERN =
  /(?:timeout|timed?\s*out|aborted|network|fetch\s*failed|rate\s*limit|too\s*many\s*requests|temporar(?:y|ily)|connection|ECONNRESET|5\d\d)/i;

function errorChainMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    messages.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages;
}

/** Message-based classification for provider/infrastructure failures. */
export function isRetryableAnalysisError(error: unknown): boolean {
  return RETRYABLE_ERROR_PATTERN.test(errorChainMessages(error).join(' '));
}

function errorCode(error: unknown): string | null {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return null;
}

/** Classify any durable full-analysis failure into one retry category. */
export function classifyFullAnalysisFailure(error: unknown): FullAnalysisFailureCategory {
  if (
    error instanceof FullAnalysisLeaseLostError ||
    errorCode(error) === 'FULL_ANALYSIS_LEASE_LOST'
  ) {
    return 'lease';
  }
  if (errorCode(error) === 'FULL_ANALYSIS_QUEUE_OWNERSHIP_LOST') return 'lease';
  if (errorCode(error) === 'FULL_ANALYSIS_BUDGET_EXCEEDED') return 'quota';
  if (errorCode(error) === 'FULL_ANALYSIS_BUDGET_ADMISSION_FAILED') return 'transient';
  if (isRetryableAnalysisError(error)) return 'transient';
  return 'permanent';
}

export type FullAnalysisRetryAction = 'discard' | 'requeue' | 'fail';

export interface FullAnalysisRetryDecision {
  action: FullAnalysisRetryAction;
  category: FullAnalysisFailureCategory;
}

/**
 * Decide the worker's terminal queue action for a failed attempt.
 *
 * - lease loss → `discard`: no settlement, no projection, no requeue.
 * - transient failures → `requeue` while attempts remain, else `fail`.
 * - quota and permanent failures → `fail` (never burn attempts).
 */
export function fullAnalysisRetryAction(
  error: unknown,
  opts: { attemptCount: number; maxAttempts: number },
): FullAnalysisRetryDecision {
  const category = classifyFullAnalysisFailure(error);
  if (category === 'lease') return { action: 'discard', category };
  if (category === 'transient' && opts.attemptCount < opts.maxAttempts) {
    return { action: 'requeue', category };
  }
  return { action: 'fail', category };
}
