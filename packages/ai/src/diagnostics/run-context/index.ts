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

// F5 — Run Diagnostic Context barrel (DEC-05 split of run-context.ts).
//
// Provides per-chat-turn diagnostic tracing via Node.js AsyncLocalStorage.
// This is the TypeScript equivalent of Python's ContextVar pattern used
// in DSA's `RunDiagnosticContext`.
//
// Usage:
//   const result = await withDiagnostics(userId, threadId, () => runChat(...));
//   // Inside runChat or any tool:
//   recordStep('fetch_candles', { symbol: 'XAUUSD' });
//   recordStep('fetch_candles', { status: 'completed', durationMs: 42 });
//   recordError(err);
//   const ctx = getDiagnosticContext(); // null if not in a diagnostic scope
//
//   - types.ts            — context/step/error contracts
//   - store.ts            — the AsyncLocalStorage singleton
//   - lifecycle.ts        — trace writers (recordStep/completeStep/recordError)
//   - snapshot.ts         — trace serialization (final redaction pass)
//   - trace.ts            — best-effort trace persistence
//   - with-diagnostics.ts — the scope runner wiring ALS + persistence

export {
  type DiagnosticError,
  type DiagnosticOptions,
  type DiagnosticStep,
  type RunDiagnosticContext,
} from './types';
export { getDiagnosticContext } from './store';
export { completeStep, recordError, recordLifecycleStep, recordStep } from './lifecycle';
export { exportDiagnosticContext } from './snapshot';
export { persistDiagnosticContext } from './trace';
export { withDiagnostics } from './with-diagnostics';
