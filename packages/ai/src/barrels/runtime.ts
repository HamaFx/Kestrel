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

// Runtime sub-barrel: workflow status, DB accessor, telemetry and Langfuse
// instrumentation, retry/recovery helpers, and run diagnostics.
// Re-exported by `src/index.ts`.

export * from '../runtime/workflow-status';
export * from '../mastra-v2/shared/telemetry-startup';
export {
  isMastraTelemetryDegraded,
  resetMastraTelemetryHealth,
} from '../mastra-v2/shared/telemetry';

export * from '../runtime/wait-until';

// P2-3 — DI-backed getDb() wrapper.
// Prefer this over importing getDb from @kestrel/db directly.
export { getDb } from '../runtime/db';

// Langfuse / OpenTelemetry instrumentation
export { initLangfuse, flushLangfuse, shutdownLangfuse } from '../runtime/instrumentation';
export { telemetryConfig, type TelemetryConfigOptions } from '../runtime/telemetry';
export { replayPersistenceFailures } from '../persistence/recovery';

// STAB-06: Exponential-backoff retry helper.
export { withRetry, type RetryOptions } from '../runtime/retry';

export { extractUserMessageText } from '../runtime/message-text';

// F5 — Run Diagnostics with Secret Redaction
export {
  withDiagnostics,
  persistDiagnosticContext,
  getDiagnosticContext,
  recordStep,
  recordLifecycleStep,
  completeStep,
  recordError,
  exportDiagnosticContext,
  redactSecrets,
  redactString,
  type RunDiagnosticContext,
  type DiagnosticStep,
  type DiagnosticError,
  type DiagnosticOptions,
} from '../diagnostics';
