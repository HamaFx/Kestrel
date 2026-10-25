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

// Log categories and the AsyncLocalStorage correlation stores.
//
// The stores are process-wide singletons: importing `traceIdStorage` through
// the `@kestrel/shared/logger` barrel always yields the same instance, so a
// diagnostic scope opened in one module is visible to every log line.

import { AsyncLocalStorage } from 'node:async_hooks';

export const LOG_CATEGORIES = [
  'auth',
  'db',
  'ai',
  'cron',
  'onboarding',
  'billing',
  'api',
  'worker',
  'cache',
  'market_data',
  'telegram',
  'email',
  'push',
  'admin',
  'system',
] as const;

export type LogCategory = (typeof LOG_CATEGORIES)[number];

// AsyncLocalStorage for trace correlation. The diagnostic context sets
// this value so every log line inside a diagnostic scope automatically
// includes the traceId without manual passing.
export const traceIdStorage = new AsyncLocalStorage<string>();
/** Correlates logs with the originating HTTP request when available. */
export const requestIdStorage = new AsyncLocalStorage<string>();
/** Correlates logs with a worker/job execution when available. */
export const runIdStorage = new AsyncLocalStorage<string>();

/** Get the current traceId from AsyncLocalStorage, if any. */
function getCurrentTraceId(): string | undefined {
  return traceIdStorage.getStore();
}

export function getCurrentCorrelation(): Record<string, string> {
  const traceId = getCurrentTraceId();
  const requestId = requestIdStorage.getStore();
  const runId = runIdStorage.getStore();
  return {
    ...(traceId ? { traceId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(runId ? { runId } : {}),
  };
}
