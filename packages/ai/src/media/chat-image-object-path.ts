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

// Audit 2026-10-31 (R7) — minimal mirror of the web uploader's object-path
// parser (`apps/web/src/lib/http/chat-image-paths.ts`) for the AI package.
//
// The AI layer must not import web code, and the web helper owns layout
// helpers the model layer does not need (path builders, day stamping,
// cleanup prefixes). This module mirrors only the reading half:
//
//   `chat-images` objects live at `<userId>/<YYYY-MM-DD>/<random>-<name>`
//   and are referenced as one of:
//     - the bare storage path `<userId>/<day>/<file>`
//     - the app proxy path / URL `/api/uploads/<userId>/<day>/<file>`
//     - the legacy world-readable Supabase URL
//       `https://<ref>.supabase.co/storage/v1/object/public/chat-images/...`
//     - Supabase authenticated/signed URL forms of the same bucket
//
// Everything else (data URLs, `blob:` URLs, foreign hosts, traversal,
// malformed segments) parses to null, so the resolver never fetches a host
// or a path the uploader could not have produced. Keep this in lockstep with
// the web parser if the layout ever changes.

export const CHAT_IMAGE_BUCKET_NAME = 'chat-images';

/** Same-origin base for proxy-served uploads. */
const CHAT_IMAGE_PROXY_PREFIX = '/api/uploads';

/** `YYYY-MM-DD`, the day partition segment. */
const CHAT_IMAGE_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const OBJECT_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,140}$/;

/** Stored references are URL-sized; refuse anything pathological up front. */
const MAX_REFERENCE_CHARS = 4096;

const BUCKET_MARKERS = [
  `${CHAT_IMAGE_PROXY_PREFIX}/`,
  `/storage/v1/object/public/${CHAT_IMAGE_BUCKET_NAME}/`,
  `/storage/v1/object/authenticated/${CHAT_IMAGE_BUCKET_NAME}/`,
  `/storage/v1/object/sign/${CHAT_IMAGE_BUCKET_NAME}/`,
] as const;

export interface ParsedChatImageReference {
  /** Canonical `<userId>/<day>/<file>` path inside the `chat-images` bucket. */
  storagePath: string;
  /** True when the value carried an explicit Kestrel/Supabase bucket marker. */
  explicitBucketPath: boolean;
  /** True when the value was an absolute URL. */
  absolute: boolean;
}

/**
 * Normalise any stored chat-image reference into the canonical storage path,
 * or null when the value is not a chat-image upload this app could own.
 */
export function parseChatImageReference(
  value: string | null | undefined,
): ParsedChatImageReference | null {
  const extracted = extractCandidate(value);
  if (extracted === null) return null;
  const { candidate, absolute } = extracted;

  let body = candidate;
  let explicitBucketPath = false;
  for (const marker of BUCKET_MARKERS) {
    const index = body.indexOf(marker);
    if (index !== -1) {
      body = body.slice(index + marker.length);
      explicitBucketPath = true;
      break;
    }
  }

  const storagePath = normalizeObjectPath(body);
  if (storagePath === null) return null;
  return { storagePath, explicitBucketPath, absolute };
}

/**
 * True when the value names the `chat-images` bucket (proxy prefix, legacy
 * public URL, authenticated or signed URL) even if its path does not
 * normalise. The resolver uses this to refuse traversal-laced references
 * instead of handing them to a provider as if they were foreign URLs.
 */
export function hasChatImageBucketMarker(value: string | null | undefined): boolean {
  const extracted = extractCandidate(value);
  if (extracted === null) return false;
  return BUCKET_MARKERS.some((marker) => extracted.candidate.includes(marker));
}

interface ExtractedCandidate {
  candidate: string;
  absolute: boolean;
}

function extractCandidate(value: string | null | undefined): ExtractedCandidate | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_REFERENCE_CHARS) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return null;

  let candidate = raw;
  let absolute = false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    absolute = true;
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
  return { candidate, absolute };
}

/** True for an absolute `http:`/`https:` URL. */
export function isAbsoluteHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    new URL(value.trim());
    return true;
  } catch {
    return false;
  }
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
