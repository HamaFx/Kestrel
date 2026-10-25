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

// Zod input parsing with a friendly 400 on failure, plus a bounded JSON body
// reader for `/api/*` route handlers.

import { validationError } from '@kestrel/shared';
import { type z } from 'zod';

/** Parse `URLSearchParams` against a zod schema, throwing on invalid input. */
export function parseSearchParams<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) params[k] = v;
  return schema.parse(params) as z.infer<S>;
}

/**
 * Hard cap on raw request body size for `parseJsonBody`. Vercel's serverless
 * function body limit is 4.5 MB, but the in-process Node runtime has no
 * intrinsic bound. The chat composer can attach 4 × 5 MB images encoded as
 * base64 data URLs (~27 MB inflated), so the cap exists primarily to
 * surface a clean 400 long before we OOM the function.
 *
 * Tune via `MAX_JSON_BODY_BYTES` env var if needed; defaults to 6 MiB.
 */
const DEFAULT_MAX_BODY_BYTES = 6 * 1024 * 1024;

function maxJsonBodyBytes(): number {
  const raw = process.env.MAX_JSON_BODY_BYTES;
  if (!raw) return DEFAULT_MAX_BODY_BYTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_BODY_BYTES;
  return Math.floor(n);
}

export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  const max = maxJsonBodyBytes();

  // Cheap pre-check: trust the client's Content-Length header to bail out
  // before we even start reading. Header may be missing on some streamed
  // requests; the byte-count guard below catches that case.
  const lenHeader = req.headers.get('content-length');
  if (lenHeader) {
    const declared = Number(lenHeader);
    if (Number.isFinite(declared) && declared > max) {
      throw validationError(`Payload too large (max ${max} bytes, got ${declared})`);
    }
  }

  // Stream the body so we can stop early if the client lied about the
  // length (or never set one). A 50 MB attacker payload should be killed
  // around byte ~6 MB, not after the whole thing has been buffered.
  // STAB-05: Also enforce a hard time limit on body reading (5s) to
  // prevent slow-loris-style attacks from tying up function instances.
  const BODY_READ_TIMEOUT_MS = 5_000;
  const body = req.body;
  let buf: Uint8Array;
  if (body) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        // STAB-05: Race reader.read() against a timeout so a slow
        // client can't hold the function open indefinitely.
        const readTimeout = AbortSignal.timeout(BODY_READ_TIMEOUT_MS);
        const readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            readTimeout.addEventListener('abort', () => reject(new Error('Body read timed out')), {
              once: true,
            });
          }),
        ]);
        const { value, done } = readResult;
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > max) {
            // Drop the reader so the underlying stream can be freed.
            await reader.cancel().catch(() => undefined);
            throw validationError(`Payload too large (max ${max} bytes)`);
          }
          chunks.push(value);
        }
      }
    } catch (err) {
      // Ensure the reader is released even on timeout or overflow.
      await reader.cancel().catch(() => undefined);
      if (err instanceof Error && err.message === 'Body read timed out') {
        throw validationError('Request body read timed out');
      }
      throw err;
    }
    buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
  } else {
    // Edge runtime fallback. Shouldn't happen for App Router POST handlers.
    const txt = await req.text();
    if (txt.length > max) {
      throw validationError(`Payload too large (max ${max} bytes)`);
    }
    buf = new TextEncoder().encode(txt);
  }

  const text = buf.byteLength === 0 ? '' : new TextDecoder().decode(buf);
  let raw: unknown;
  try {
    raw = text.length === 0 ? undefined : JSON.parse(text);
  } catch (err) {
    throw validationError('Invalid JSON body', err instanceof Error ? err.message : undefined);
  }
  return schema.parse(raw) as z.infer<S>;
}
