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

// the one place that knows the object layout and the
// URL shapes of chat-image uploads.
//
// Objects live in the `chat-images` bucket as:
//
//   <userId>/<YYYY-MM-DD>/<12-hex-random>-<sanitized-filename>
//
// The bucket is PRIVATE. Nothing is served from Supabase directly; the app
// streams objects through `GET /api/uploads/<userId>/<day>/<file>` after
// checking that the caller owns the `<userId>` prefix.
//
// This module is deliberately pure and dependency-free so the uploader
// (`storage.ts`), the storage proxy route, the cleanup cron and the journal
// renderers all share it. The cleanup cron derives its per-user, per-day
// prefixes from these helpers instead of re-deriving the layout, which is how
// it silently stopped matching objects in the first place.

export const CHAT_IMAGE_BUCKET_NAME = 'chat-images';

/** Same-origin base for proxy-served uploads. */
export const CHAT_IMAGE_PROXY_PREFIX = '/api/uploads';

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const OBJECT_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,140}$/;

/** `YYYY-MM-DD`, the day partition segment. */
export const CHAT_IMAGE_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** UTC day stamp used for the `<YYYY-MM-DD>` partition segment. */
export function chatImageDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Random-prefixed object path so the same filename uploaded twice does not
 * collide. The prefix is a 12-char hex slug (48 bits of entropy) and the day
 * partition lets the cleanup cron target one day at a time.
 */
export function buildChatImageObjectPath(
  userId: string,
  filename: string,
  at: Date = new Date(),
): string {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error('invalid user id for storage path');
  }
  const safeBase = sanitizeFilename(filename);
  const prefix = randomHexPrefix();
  return `${userId}/${chatImageDay(at)}/${prefix}-${safeBase}`;
}

/**
 * Prefix a bucket listing shares with `buildChatImageObjectPath`, without the
 * object name. `chatImageObjectPrefix(userId)` lists a user's day folders;
 * `chatImageObjectPrefix(userId, day)` lists that day's objects.
 */
export function chatImageObjectPrefix(userId: string, day?: string): string {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error('invalid user id for storage prefix');
  }
  if (day === undefined) return userId;
  if (!CHAT_IMAGE_DAY_PATTERN.test(day)) {
    throw new Error('invalid day for storage prefix');
  }
  return `${userId}/${day}`;
}

/**
 * Normalise any of the shapes a stored screenshot reference can take into the
 * canonical `<userId>/<day>/<file>` storage path, or null when the value is
 * not a chat-image upload.
 *
 * Accepts:
 *   - the bare storage path (`<userId>/<day>/<file>`)
 *   - the app proxy path / URL (`/api/uploads/<userId>/<day>/<file>`)
 *   - the legacy world-readable Supabase URL this feature used to store
 *     (`https://<ref>.supabase.co/storage/v1/object/public/chat-images/...`)
 *   - Supabase signed/authenticated URL forms (`.../object/sign/...`)
 *
 * Rejects: data/blob URLs, foreign hosts, traversal segments, and anything
 * that does not have exactly the three expected segments. There is no
 * percent-decoding trap: the uploader sanitises every segment, and decoded
 * values are re-validated against the same character classes.
 */
export function parseChatImageObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;

  let candidate = raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    candidate = url.pathname;
  }
  candidate = candidate.split('#')[0]!.split('?')[0]!;

  for (const marker of [
    `${CHAT_IMAGE_PROXY_PREFIX}/`,
    `/storage/v1/object/public/${CHAT_IMAGE_BUCKET_NAME}/`,
    `/storage/v1/object/authenticated/${CHAT_IMAGE_BUCKET_NAME}/`,
    `/storage/v1/object/sign/${CHAT_IMAGE_BUCKET_NAME}/`,
  ]) {
    const index = candidate.indexOf(marker);
    if (index !== -1) {
      candidate = candidate.slice(index + marker.length);
      break;
    }
  }

  return normalizeObjectPath(candidate);
}

/** Proxy path (`/api/uploads/...`) for a stored reference, or null when foreign. */
export function chatImageProxyPath(value: string | null | undefined): string | null {
  const storagePath = parseChatImageObjectPath(value);
  return storagePath === null ? null : `${CHAT_IMAGE_PROXY_PREFIX}/${storagePath}`;
}

/**
 * `src` for an `<img>`/`next/image` renderer. Chat-image references (new proxy
 * paths and legacy public URLs alike) resolve to the owner-checked proxy;
 * anything else (data URLs, foreign hosts) is passed through untouched.
 */
export function resolveChatImageSrc(value: string): string {
  return chatImageProxyPath(value) ?? value;
}

function normalizeObjectPath(candidate: string): string | null {
  const segments = candidate.split('/').filter((segment) => segment.length > 0);
  if (segments.length !== 3) return null;
  const [rawUserId, rawDay, rawName] = segments as [string, string, string];
  const userId = decodeSegment(rawUserId);
  const day = decodeSegment(rawDay);
  const name = decodeSegment(rawName);
  if (userId === null || day === null || name === null) return null;
  if (!USER_ID_PATTERN.test(userId)) return null;
  if (!CHAT_IMAGE_DAY_PATTERN.test(day)) return null;
  if (name === '.' || name === '..' || !OBJECT_NAME_PATTERN.test(name)) return null;
  return `${userId}/${day}/${name}`;
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function sanitizeFilename(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
  return safe.length > 0 ? safe : 'attachment';
}

function randomHexPrefix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}
