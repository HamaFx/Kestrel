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

// F5 — trace persistence (DEC-05 split of run-context.ts). Persistence is
// best-effort: a storage failure must never block a chat turn, but it is
// logged with the trace identity so a missing trace stays diagnosable.

import { createCategorizedLogger } from '@kestrel/shared/logger';

import { persistTrace, type PersistedTrace } from '../trace-persistence';
import { exportDiagnosticContextInternal } from './snapshot';
import type { RunDiagnosticContext } from './types';

const dlog = createCategorizedLogger('ai', { component: 'diagnostics' });

export async function persistDiagnosticContext(
  ctx: RunDiagnosticContext | null,
  status: 'completed' | 'failed' = 'completed',
): Promise<void> {
  if (!ctx) return;
  await maybePersistTrace(ctx, status);
}

export async function maybePersistTrace(
  ctx: RunDiagnosticContext,
  status: 'completed' | 'failed' = 'completed',
): Promise<void> {
  try {
    const trace = exportDiagnosticContextInternal(ctx, status);
    const persisted: PersistedTrace = {
      traceId: String(trace.traceId ?? ctx.traceId),
      userId: String(trace.userId ?? ctx.userId),
      threadId: String(trace.threadId ?? ctx.threadId),
      startedAt: Number(trace.startedAt ?? ctx.startedAt),
      durationMs: Number(trace.durationMs ?? Date.now() - ctx.startedAt),
      stepCount: Number(trace.stepCount ?? ctx.steps.length),
      errorCount: Number(trace.errorCount ?? ctx.errors.length),
      status,
      trace,
    };
    await persistTrace(persisted);
  } catch (err) {
    // Persistence failures must never block the chat turn, but they must be
    // visible with the trace identity so a missing trace is diagnosable.
    const traceId = ctx.traceId;
    dlog.error('trace persistence failed', {
      traceId,
      status,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
