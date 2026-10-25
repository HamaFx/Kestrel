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

// SPDX-License-Identifier: Apache-2.0

/**
 * Resilience primitives (RULE-R01).
 *
 * Every non-critical failure path must be explicit: either parse with a
 * typed fallback (`safeParseJson`), run a best-effort side effect that logs
 * its failure (`bestEffort`), or return an expected error as a value
 * (`Result`). Silent `catch {}` blocks are forbidden.
 *
 * This module is client-safe: it has no Node built-in imports. Callers that
 * want structured logging inject a logger through `bestEffort` options.
 */

import type { AppError } from './errors';

export type Result<T, E = AppError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Wrap a successful domain value. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Wrap an expected domain error. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Narrow a `Result` to its success branch. */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** Narrow a `Result` to its failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Parse JSON without throwing. Returns `fallback` for malformed input,
 * including `null`/`undefined` raw values stored in JSON columns.
 */
export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    // Expected: malformed persisted JSON. The fallback is the explicit
    // contract; callers that need diagnostics use `bestEffort`.
    void error;
    return fallback;
  }
}

/** Minimal logger surface accepted by `bestEffort` (client-safe). */
export interface ResilienceLogger {
  debug: (context: Record<string, unknown>, message: string) => void;
  warn: (context: Record<string, unknown>, message: string) => void;
}

export interface BestEffortOptions<T> {
  /** Stable operation name used in diagnostics (e.g. `cache_warmup`). */
  operation: string;
  /** Value returned when the operation fails. */
  fallback: T;
  /** Optional structured logger; omit when the caller has no logger. */
  logger?: ResilienceLogger;
  /** Optional error sink (metrics, toast, test spy). */
  onError?: (error: unknown, operation: string) => void;
  /** Diagnostic severity. Defaults to `warn`. */
  level?: 'debug' | 'warn';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Execute an optional side effect. Failures are logged and converted into a
 * typed fallback instead of aborting the caller's primary flow.
 */
export async function bestEffort<T>(
  fn: () => Promise<T> | T,
  options: BestEffortOptions<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const level = options.level ?? 'warn';
    options.logger?.[level]({ operation: options.operation, error: describeError(error) }, level);
    options.onError?.(error, options.operation);
    return options.fallback;
  }
}
