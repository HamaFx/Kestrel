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

// F5 — trace lifecycle writers (DEC-05 split of run-context.ts): every
// mutation the call chain can make to the active diagnostic context.
// Recording is a no-op when no `withDiagnostics` scope is active.

import type { ObservabilityEventName } from '@kestrel/shared';

import { redactSecrets } from '../redact';
import { diagnosticStore } from './store';
import type { DiagnosticError, DiagnosticStep } from './types';

/**
 * Record a step in the current diagnostic context.
 * Metadata is automatically redacted before storage.
 *
 * If no diagnostic context is active, this is a no-op.
 */
export function recordStep(name: string, metadata?: Record<string, unknown>): void {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return;

  const step: DiagnosticStep = {
    name,
    status: 'started',
    timestamp: Date.now(),
  };

  if (metadata !== undefined) {
    step.metadata = redactSecrets(metadata) as Record<string, unknown>;
  }

  ctx.steps.push(step);
}

/**
 * Record a typed lifecycle event using the shared observability contract.
 * The event name is also used as the diagnostic step name so existing
 * diagnostic consumers remain backward compatible.
 */
export function recordLifecycleStep(
  event: ObservabilityEventName,
  metadata?: Record<string, unknown>,
): void {
  recordStep(event, metadata);
}

/**
 * Mark the most recent step with a given name as completed or failed,
 * optionally recording its duration.
 *
 * If no matching step is found, a new step is created with the given status.
 * If no diagnostic context is active, this is a no-op.
 */
export function completeStep(
  name: string,
  status: 'completed' | 'failed',
  durationMs?: number,
  metadata?: Record<string, unknown>,
): void {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return;

  // Find the last 'started' step with this name.
  let lastStartedIdx = -1;
  for (let i = ctx.steps.length - 1; i >= 0; i--) {
    const s = ctx.steps[i]!;
    if (s.name === name && s.status === 'started') {
      lastStartedIdx = i;
      break;
    }
  }

  if (lastStartedIdx >= 0) {
    const step = ctx.steps[lastStartedIdx]!;
    step.status = status;
    if (durationMs !== undefined) step.durationMs = durationMs;
    if (metadata !== undefined) {
      step.metadata = {
        ...(step.metadata ?? {}),
        ...(redactSecrets(metadata) as Record<string, unknown>),
      };
    }
  } else {
    // No matching started step — create a fresh one.
    const step: DiagnosticStep = {
      name,
      status,
      timestamp: Date.now(),
    };
    if (durationMs !== undefined) step.durationMs = durationMs;
    if (metadata !== undefined) {
      step.metadata = redactSecrets(metadata) as Record<string, unknown>;
    }
    ctx.steps.push(step);
  }
}

/**
 * Record an error in the current diagnostic context.
 * The error message and stack trace are automatically redacted.
 *
 * If no diagnostic context is active, this is a no-op.
 */
export function recordError(err: unknown): void {
  const ctx = diagnosticStore.getStore();
  if (!ctx) return;

  const errorObj = err as { message?: unknown; name?: unknown; stack?: unknown };
  const diagnosticError: DiagnosticError = {
    message: redactSecrets(
      typeof errorObj?.message === 'string' ? errorObj.message : String(err),
    ) as string,
    name: typeof errorObj?.name === 'string' ? errorObj.name : 'Error',
    timestamp: Date.now(),
  };

  if (typeof errorObj?.stack === 'string') {
    diagnosticError.stack = redactSecrets(errorObj.stack) as string;
  }

  ctx.errors.push(diagnosticError);
}
