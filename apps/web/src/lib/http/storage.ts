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

// Phase 3 hardening §7 — thin Supabase Storage client for chat image
// uploads.
//
// We talk to the storage REST API directly instead of pulling in
// `@supabase/supabase-js` because:
//
//   - The SDK is large; we only need one operation (PUT object).
//   - We already have `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
//     the server env. No additional config needed.
//   - The web bundle stays Edge-friendly for any future migration.
//
// the bucket (`chat-images`) is PRIVATE. Uploads are
// written with the service-role key, and the only thing a caller gets back is
// an app-owned proxy path (`/api/uploads/<userId>/<day>/<file>`); object bytes
// are streamed by `GET /api/uploads/[[...path]]` after an ownership check.
// There is no public Supabase URL and therefore no permanent, unauthenticated
// link to a user's chart screenshot.
//
// OPERATOR ACTION — one line, once per deployment (Supabase SQL editor or
// `psql "$SUPABASE_DB_URL"`):
//
//   update storage.buckets set public = false where id = 'chat-images';
//
// (Dashboard equivalent: Storage → chat-images → Settings → uncheck "Public
// bucket".) Until that runs, objects already in the bucket stay readable by
// anyone holding the old `/object/public/...` URL; the proxy and the cleanup
// cron work either way. Note that machine consumers of these URLs (the AI
// providers that fetch attached images) need the AI layer to inline uploads
// as data URLs before the bucket is flipped; see the R7 finding.
//
// Retention is enforced by the daily cleanup cron
// (`/api/cron/cleanup-uploads`), which walks the `userId/day` prefixes built
// by `chat-image-paths.ts` and deletes day folders older than the retention
// window. The `x-metadata` header still records the upload epoch for
// diagnostics.

import {
  buildChatImageObjectPath,
  CHAT_IMAGE_BUCKET_NAME,
  CHAT_IMAGE_PROXY_PREFIX,
} from './chat-image-paths';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // mirrors composer-side cap
const MAX_STORAGE_RESPONSE_BYTES = 256 * 1024;

/**
 * Image types the storage helper will write. Kept in sync with the upload
 * route's allowlist: raster only, no `image/svg+xml` (SVG is active content
 * and would be an XSS vector if a future caller served it inline).
 */
const ALLOWED_MEDIA_TYPE_PATTERN = /^image\/(jpeg|png|webp|gif)$/;

export interface ChatImageUploadEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface ChatImageUploadResult {
  /**
   * App-owned proxy path (`/api/uploads/<userId>/<day>/<file>`) the caller
   * reaches the object through. Relative by design: the upload route makes it
   * absolute with `NEXT_PUBLIC_APP_URL` before handing it to the client.
   */
  url: string;
  /** Storage path inside the bucket — useful for delete operations. */
  path: string;
  /** Detected mime-type, mirrors what the model needs in `mediaType`. */
  mediaType: string;
  /** ms epoch UTC of the upload — surfaced for the cleanup cron. */
  uploadedAt: number;
}

export interface ChatImageUploadInput {
  userId: string;
  /**
   * Raw bytes. Caller is expected to have already validated the
   * file type / size at the route boundary; we re-check size here as
   * defence in depth.
   */
  body: Uint8Array | ArrayBuffer;
  mediaType: string;
  /** Original filename — used only for the storage-side basename. */
  filename: string;
}

/**
 * Upload a single chat-attachment image to Supabase Storage. Returns the
 * proxy path the caller can store and render, plus the storage path so the
 * cleanup cron (and future delete operations) can address the object.
 *
 * The bucket is private; the object is never world-readable.
 *
 * Throws when:
 *   - The media type is not a permitted raster image.
 *   - The byte payload exceeds `MAX_UPLOAD_BYTES`.
 *   - Supabase Storage returns a non-2xx (passes the body through so
 *     the route handler's error envelope surfaces a useful message).
 */
export async function uploadChatImage(
  env: ChatImageUploadEnv,
  input: ChatImageUploadInput,
): Promise<ChatImageUploadResult> {
  if (!input.mediaType.startsWith('image/')) {
    throw new Error(`media type ${input.mediaType} is not an image`);
  }
  if (!ALLOWED_MEDIA_TYPE_PATTERN.test(input.mediaType)) {
    throw new Error(`media type ${input.mediaType} is not an allowed image type`);
  }
  if (!input.userId || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.userId)) {
    throw new Error('invalid user id for storage path');
  }

  const bytes = input.body instanceof Uint8Array ? input.body : new Uint8Array(input.body);
  if (bytes.byteLength === 0) {
    throw new Error('upload payload is empty');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`upload exceeds ${MAX_UPLOAD_BYTES} bytes (got ${bytes.byteLength})`);
  }
  const path = buildChatImageObjectPath(input.userId, input.filename);
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('Supabase Storage requires HTTPS in production');
  }
  const uploadUrl = `${base.toString().replace(/\/+$/, '')}/storage/v1/object/${CHAT_IMAGE_BUCKET_NAME}/${path}`;
  const uploadedAt = Date.now();

  const res = await fetch(uploadUrl, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': input.mediaType,
      'cache-control': 'private, max-age=0, no-store',
      'content-disposition': 'attachment',
      // `x-upsert: 'false'` so we 409 instead of overwriting on the
      // (statistically improbable) collision. The randomised path
      // generator keeps this safe in practice.
      'x-upsert': 'false',
      // Upload-epoch metadata for diagnostics. Deletion is driven by the
      // day partition, not by this header.
      'x-metadata': JSON.stringify({ uploadedAt }),
    },
    body: bytes as unknown as BodyInit,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '<no body>')).slice(0, MAX_STORAGE_RESPONSE_BYTES);
    throw new Error(`Supabase Storage upload failed: HTTP ${res.status} — ${detail.slice(0, 200)}`);
  }

  return {
    url: `${CHAT_IMAGE_PROXY_PREFIX}/${path}`,
    path,
    mediaType: input.mediaType,
    uploadedAt,
  };
}

export const CHAT_IMAGE_MAX_BYTES = MAX_UPLOAD_BYTES;

const LEGACY_STORAGE_PREFIXES = ['hamafx:', 'hfx_'] as const;

const LEGACY_STORAGE_ALIASES: Record<string, string> = {
  'hamafx:prefs': 'kestrel:prefs:v1',
  'hamafx:ai-prefs': 'kestrel:ai-prefs:v1',
  'hfx_banner_dismissed:api-keys-from-chat': 'kestrel:banner-dismissed:api-keys-from-chat',
  hfx_install_dismissed: 'kestrel:install-dismissed',
};

/**
 * Move browser-local state from pre-rebrand namespaces to Kestrel keys.
 * Existing Kestrel values always win, so a user never loses newer state.
 */
export function migrateLegacyStorageNamespace(): void {
  if (typeof window === 'undefined') return;

  try {
    const legacyKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && LEGACY_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        legacyKeys.push(key);
      }
    }

    for (const oldKey of legacyKeys) {
      const suffix = oldKey.startsWith('hamafx:')
        ? oldKey.slice('hamafx:'.length)
        : oldKey.slice('hfx_'.length);
      const newKey = LEGACY_STORAGE_ALIASES[oldKey] ?? `kestrel:${suffix}`;
      migrateLocalStorageKey(oldKey, newKey);
    }
  } catch {
    // Storage may be unavailable in private browsing or restrictive contexts.
  }
}

/** Migrate the legacy counterpart of a canonical Kestrel key before reading it. */
export function migrateLegacyStorageKey(newKey: string): void {
  if (!newKey.startsWith('kestrel:')) return;
  migrateLegacyStorageNamespace();
}

/**
 * Migrate a value stored under an old localStorage key to a new key.
 * The value is JSON-parsed, optionally transformed, and written under
 * the new key; the old key is then removed. If the new key already
 * exists, no action is taken.
 */
export function migrateLocalStorageKey<T>(
  oldKey: string,
  newKey: string,
  transform?: (value: unknown) => T,
): void {
  if (typeof window === 'undefined') return;

  try {
    if (localStorage.getItem(newKey) !== null) {
      localStorage.removeItem(oldKey);
      return;
    }

    const raw = localStorage.getItem(oldKey);
    if (raw === null) return;

    let migrated: unknown;
    try {
      const parsed = JSON.parse(raw) as unknown;
      migrated = transform ? transform(parsed) : parsed;
    } catch {
      // Preserve the legacy value when it cannot be parsed or transformed.
      // A failed migration must never destroy the user's only copy.
      return;
    }

    try {
      localStorage.setItem(newKey, JSON.stringify(migrated));
      localStorage.removeItem(oldKey);
    } catch {
      // Preserve the legacy value when the new write is unavailable.
    }
  } catch {
    // Storage may be unavailable or the old value may be corrupt.
  }
}
