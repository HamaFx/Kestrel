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

// F5 — trace serialization (DEC-05 split of run-context.ts). All sensitive
// data has already been redacted at record time, but the serializer runs one
// final redaction pass for safety.

import { redactSecrets } from '../redact';
import { diagnosticStore } from './store';
import type { RunDiagnosticContext } from './types';

/**
 * Serialize the current diagnostic context to a plain object suitable
 * for sending to Sentry, logging, or returning from a diagnostics API.
 * All sensitive data has already been redacted at record time, but we
 * run one final redaction pass for safety.
 *
 * Returns null if no diagnostic context is active.
 */
export function exportDiagnosticContext(): Record<string, unknown> | null {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return null;
  return exportDiagnosticContextInternal(ctx, 'completed');
}

export function exportDiagnosticContextInternal(
  ctx: RunDiagnosticContext,
  status: 'completed' | 'failed' = 'completed',
): Record<string, unknown> {
  return redactSecrets({
    traceId: ctx.traceId,
    userId: ctx.userId,
    threadId: ctx.threadId,
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx.runId ? { runId: ctx.runId } : {}),
    ...(ctx.jobId ? { jobId: ctx.jobId } : {}),
    startedAt: ctx.startedAt,
    durationMs: Date.now() - ctx.startedAt,
    stepCount: ctx.steps.length,
    errorCount: ctx.errors.length,
    status,
    steps: ctx.steps,
    errors: ctx.errors,
  }) as Record<string, unknown>;
}
