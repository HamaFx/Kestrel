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

// Request building for the BiQuote REST client: base-URL resolution, query
// encoding, self-throttling, timeout/abort handling, error-envelope parsing
// and response validation. Endpoint wrappers live in the sibling modules.

import { z } from 'zod';

import { noteBackoff, tryReserve, type ThrottleConfig } from '../../../cache/throttle';
import { ProviderError } from '../../../errors';

export const PROVIDER = 'biquote';
const DEFAULT_BASE_URL = 'https://biquote.io';
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Self-throttle config. BiQuote publishes an anonymous REST quota of
 * 15,000 requests/minute per IP (250 req/sec). We cap self-throttle at
 * 1,500 req/min (10% of the upstream quota) to protect against runaway loops
 * while supporting 100% on-demand REST mode without artificial bottlenecks.
 *
 * On 429, the adaptive throttle drops the cap to 80% of `limit` for
 * `cooloffMs` (90 s default), then auto-recovers.
 */
export const BIQUOTE_THROTTLE_LIMIT = 1500;
export const THROTTLE: ThrottleConfig = { limit: BIQUOTE_THROTTLE_LIMIT, windowMs: 60_000 };

const ErrorEnvelopeSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

export interface CallOptions {
  signal?: AbortSignal;
  /** Override the base URL (used by tests). Defaults to `https://biquote.io`. */
  baseUrl?: string;
  /** Skip the in-memory throttle reservation (used by tests). */
  skipThrottle?: boolean;
}

type QueryParams = Record<string, string | readonly string[] | undefined> | null;

function resolveBaseUrl(opts: CallOptions): string {
  return opts.baseUrl ?? process.env.BIQUOTE_BASE_URL ?? DEFAULT_BASE_URL;
}

export async function call<T>(
  path: string,
  query: QueryParams,
  schema: z.ZodType<T>,
  opts: CallOptions,
): Promise<T> {
  if (!opts.skipThrottle && !(await tryReserve(PROVIDER, THROTTLE))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL(path, resolveBaseUrl(opts));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v as string);
      }
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else
      opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    if (opts?.signal?.aborted) {
      throw opts.signal.reason ?? cause;
    }
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 429) await noteBackoff(PROVIDER, THROTTLE);

    // BiQuote responds with `{ "message": "..." }` or `{ "error": "..." }` on 4xx.
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const json: unknown = await res.json();
      const env = ErrorEnvelopeSchema.safeParse(json);
      if (env.success && (env.data.message || env.data.error)) {
        message = env.data.message ?? env.data.error ?? message;
      }
    } catch {
      /* body not JSON or empty — use the status-text fallback */
    }

    throw new ProviderError(
      res.status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      message,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid JSON', { cause });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError(
      'PROVIDER_PARSE_ERROR',
      PROVIDER,
      `unexpected response shape: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .slice(0, 3)
        .join(', ')}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}
