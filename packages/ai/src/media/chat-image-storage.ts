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

// service-role read of one `chat-images` object.
//
// The AI layer cannot ask a model provider to fetch the owner-authorised
// proxy (`/api/uploads/...`) or a legacy public Supabase URL once the bucket
// is private, so it downloads the bytes itself and hands back a `data:` URL.
//
// The upstream host is always the configured `SUPABASE_URL` — never a host
// taken from the reference — the caller has already verified the storage path
// grammar, only raster content types are accepted, and the byte stream is
// capped. Any failure returns `{ kind: 'unavailable' }` for the caller to
// turn into an honest provider-visible note.

import { CHAT_IMAGE_BUCKET_NAME } from './chat-image-object-path';

/** Mirrors the upload route's 5 MB cap (`storage.ts` MAX_UPLOAD_BYTES). */
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Only raster types the uploader can produce, matching the proxy route. */
const RASTER_MEDIA_TYPE_PATTERN = /^image\/(jpeg|png|webp|gif)$/;

export interface ChatImageStorageOptions {
  /**
   * Env-like object holding `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   * Defaults to `process.env`; tests inject a fake.
   */
  env?: object | undefined;
  /** Injection seam for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch | undefined;
  signal?: AbortSignal | null | undefined;
  /** Override the 5 MB cap (tests use small values). */
  maxBytes?: number | undefined;
}

export type ChatImageStorageResult =
  | { kind: 'inline'; mediaType: string; dataUrl: string; base64: string }
  | { kind: 'unavailable' };

/** Download one object and inline it, or report it unavailable. */
export async function fetchChatImageInline(
  storagePath: string,
  options: ChatImageStorageOptions,
): Promise<ChatImageStorageResult> {
  const credentials = readStorageCredentials(options.env);
  if (credentials === null) return { kind: 'unavailable' };

  const objectUrl = `${credentials.baseUrl}/storage/v1/object/authenticated/${CHAT_IMAGE_BUCKET_NAME}/${encodeObjectPath(storagePath)}`;
  let upstream: Response;
  try {
    upstream = await (options.fetchImpl ?? fetch)(objectUrl, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: { authorization: `Bearer ${credentials.serviceRoleKey}` },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return { kind: 'unavailable' };
  }

  // Any non-2xx means the object is absent or unusable; the caller shows the
  // honest note instead of an unfetchable reference.
  if (!upstream.ok) return { kind: 'unavailable' };

  const contentType = (upstream.headers.get('content-type') ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase();
  if (!RASTER_MEDIA_TYPE_PATTERN.test(contentType)) return { kind: 'unavailable' };

  const bytes = await readBodyWithinLimit(upstream, options.maxBytes ?? CHAT_IMAGE_MAX_BYTES);
  if (bytes === null) return { kind: 'unavailable' };

  const base64 = Buffer.from(bytes).toString('base64');
  return {
    kind: 'inline',
    mediaType: contentType,
    dataUrl: `data:${contentType};base64,${base64}`,
    base64,
  };
}

/** Read at most `maxBytes`; null once the cap is exceeded or the stream fails. */
async function readBodyWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

interface StorageCredentials {
  baseUrl: string;
  serviceRoleKey: string;
}

function readStorageCredentials(env: object | undefined): StorageCredentials | null {
  const source: object | undefined =
    env ?? (typeof process === 'undefined' ? undefined : process.env);
  const url = readString(source, 'SUPABASE_URL');
  const serviceRoleKey = readString(source, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return { baseUrl: url.replace(/\/+$/, ''), serviceRoleKey };
}

function readString(source: object | undefined, key: string): string | undefined {
  if (!source) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function encodeObjectPath(storagePath: string): string {
  return storagePath.split('/').map(encodeURIComponent).join('/');
}
