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

// Shared REST transport for market-data providers: one bounded fetch with
// self-throttle, caller-signal linking, 429 backoff, JSON parsing, and
// provider-scoped error mapping. Provider clients own URL/query building and
// response schemas; they do not re-implement transport policy.

import type { z } from 'zod';

import { noteBackoff, tryReserve, type ThrottleConfig } from '../cache/throttle';
import { ProviderError } from '../errors';

export interface ProviderFetchJsonArgs<T> {
  /** Provider id used in errors and throttle state. */
  provider: string;
  url: URL | string;
  schema: z.ZodType<T>;
  throttle?: ThrottleConfig;
  skipThrottle?: boolean;
  /** Caller cancellation. Rethrown as-is before timeout mapping. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** HTTP statuses that count as quota exhaustion (default `[429]`). */
  quotaStatuses?: readonly number[];
  /** Message used when the in-process throttle rejects the call. */
  quotaMessage?: string;
  /** Extract a provider error message from the response body. */
  errorMessage?: (json: unknown) => string | null;
  headers?: HeadersInit;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Fetch and parse one JSON response.
 *
 * Cancellation order matters: a caller-aborted request must surface the
 * caller's reason, never a timeout penalty (the previous marketaux/fred
 * clients mapped both to `PROVIDER_TIMEOUT`, poisoning provider health).
 */
export async function providerFetchJson<T>(args: ProviderFetchJsonArgs<T>): Promise<T> {
  const {
    provider,
    url,
    schema,
    throttle,
    skipThrottle,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    quotaStatuses = [429],
    quotaMessage,
    errorMessage,
    headers,
  } = args;

  if (throttle && !skipThrottle && !(await tryReserve(provider, throttle))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      provider,
      quotaMessage ?? `Self-throttle: capped at ${throttle.limit} req / ${throttle.windowMs}ms`,
    );
  }

  const timeout = AbortSignal.timeout(Math.max(1, Math.trunc(timeoutMs)));
  const linked = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(url, {
      ...(headers ? { headers } : {}),
      signal: linked,
      cache: 'no-store',
    });
  } catch (cause) {
    if (signal?.aborted) throw signal.reason ?? cause;
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      provider,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  }

  if (!res.ok) {
    const isQuota = quotaStatuses.includes(res.status);
    if (isQuota && throttle) await noteBackoff(provider, throttle);
    let message = `HTTP ${res.status} ${res.statusText}`.trimEnd();
    if (errorMessage) {
      const body: unknown = await res.json().catch(() => null);
      message = errorMessage(body) ?? message;
    }
    throw new ProviderError(
      isQuota ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      provider,
      message,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', provider, 'invalid JSON', { cause });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError(
      'PROVIDER_PARSE_ERROR',
      provider,
      `unexpected response shape: ${parsed.error.issues
        .map((issue) => issue.path.join('.'))
        .slice(0, 3)
        .join(', ')}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}
