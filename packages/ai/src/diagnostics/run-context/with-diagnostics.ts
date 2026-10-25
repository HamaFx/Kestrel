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

// F5 — AsyncLocalStorage wiring (DEC-05 split of run-context.ts). The scope
// runner binds the diagnostic context (and the shared correlation ids) for the
// entire async call chain, then persists the trace on exit.

import { randomUUID } from 'node:crypto';

import { requestIdStorage, runIdStorage, traceIdStorage } from '@kestrel/shared/logger';

import { recordError } from './lifecycle';
import { exportDiagnosticContextInternal } from './snapshot';
import { diagnosticStore } from './store';
import { maybePersistTrace } from './trace';
import type { DiagnosticOptions, RunDiagnosticContext } from './types';

/**
 * N-01 (audit 2026-10-18) — aborts are lifecycle outcomes, not failures. A
 * user/lease cancel surfaces as `AbortError`; the sync deadline
 * (`AbortSignal.timeout`) surfaces as a `TimeoutError` DOMException. Both are
 * already converted into explicit terminal outcomes by their callers
 * (`MastraModeStrictFailureError` detail or a `cancelled` run outcome), so
 * recording them here double-counted aborts in error telemetry.
 */
function isAbortLike(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Wrap an async function in a diagnostic context. All code inside `fn`
 * (including downstream async calls) can use `recordStep`, `recordError`,
 * and `getDiagnosticContext` to add to the trace.
 *
 * The context is automatically cleaned up when `fn` resolves or rejects.
 */
export function withDiagnostics<T>(
  userId: string,
  threadId: string,
  fn: () => Promise<T>,
  options: DiagnosticOptions = {},
): Promise<T> {
  const ctx: RunDiagnosticContext = {
    traceId: options.traceId ?? randomUUID(),
    userId,
    threadId,
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.jobId ? { jobId: options.jobId } : {}),
    startedAt: Date.now(),
    steps: [],
    errors: [],
  };

  // Set correlation values in AsyncLocalStorage so the logger auto-injects
  // them into every log line inside this diagnostic scope.
  const runBody = () =>
    diagnosticStore.run(ctx, async () => {
      try {
        const result = await fn();
        if (!options.deferCompletion) await maybePersistTrace(ctx);
        return result;
      } catch (err) {
        // N-01: aborts/deadline timeouts are terminal lifecycle outcomes that
        // the caller already surfaces; only genuine failures are error events.
        if (!isAbortLike(err)) recordError(err);
        await maybePersistTrace(ctx, 'failed');
        if (err instanceof Error) {
          try {
            (err as Error & { diagnosticContext?: unknown }).diagnosticContext =
              exportDiagnosticContextInternal(ctx, 'failed');
          } catch {
            // Read-only error object — preserve the original failure.
          }
        }
        throw err;
      }
    });

  const runWithOptionalRunId = () =>
    options.runId ? runIdStorage.run(options.runId, runBody) : runBody();
  const runWithOptionalRequestId = () =>
    options.requestId
      ? requestIdStorage.run(options.requestId, runWithOptionalRunId)
      : runWithOptionalRunId();

  return traceIdStorage.run(ctx.traceId, runWithOptionalRequestId);
}
