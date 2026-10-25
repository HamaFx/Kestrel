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

// F5 — the AsyncLocalStorage instance backing every diagnostic scope
// (DEC-05 split of run-context.ts). This is the one module-level singleton:
// every sibling reads the current context through `getDiagnosticContext`.

import { AsyncLocalStorage } from 'node:async_hooks';

import type { RunDiagnosticContext } from './types';

// AsyncLocalStorage propagates the context through the entire async call
// chain — tools, agents, persistence — without explicit threading.
const diagnosticStore = new AsyncLocalStorage<RunDiagnosticContext>();

/**
 * Get the current diagnostic context, or null if not inside a
 * `withDiagnostics` scope. Tools and helpers should check for null
 * before recording — diagnostics are optional and must never throw.
 */
export function getDiagnosticContext(): RunDiagnosticContext | null {
  return diagnosticStore.getStore() ?? null;
}

/** The raw store — siblings run scopes and mutate the active context. */
export { diagnosticStore };
