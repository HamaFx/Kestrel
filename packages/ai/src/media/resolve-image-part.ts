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

// Audit 2026-10-31 (R7) — the decision table for a chat-image reference.
//
// Chat screenshots live in the PRIVATE `chat-images` Supabase bucket and are
// referenced by `/api/uploads/<userId>/<day>/<file>` (served by an
// owner-authorised proxy) or by a legacy world-readable Supabase URL. A model
// provider has no session, so it cannot fetch either shape once the bucket is
// private. Bytes are downloaded server-side with the service-role key and
// inlined only at the provider boundary (`image-model-middleware.ts`); every
// earlier stage must keep the reference so nothing stores the bytes.
//
// Decision table:
//
//   Kestrel-owned (proxy path/URL, bare storage path, legacy public or
//   signed Supabase URL)      -> fetch from Supabase, inline bytes
//   already-inline `data:` URL -> passed through unchanged
//   foreign absolute http(s) URL (including a 3-segment pathname with no
//   Kestrel bucket marker)     -> passed through unchanged
//   relative / bare value that is not a Kestrel object path, `blob:` URL,
//   missing reference          -> honest text note
//   storage failure, oversize, non-raster upstream, missing credentials
//                              -> honest text note
//
// Conservative by construction: the upstream host always comes from
// `SUPABASE_URL` (never from the reference), the object path must match the
// uploader's `<userId>/<day>/<file>` grammar, only raster content types are
// forwarded, and the byte stream is capped. A caller-supplied cache dedupes
// repeated references within one turn.

import {
  hasChatImageBucketMarker,
  isAbsoluteHttpUrl,
  parseChatImageReference,
} from './chat-image-object-path';
import { fetchChatImageInline } from './chat-image-storage';

/** Provider-visible note when an attached image cannot be delivered. */
export const CHAT_IMAGE_UNAVAILABLE_TEXT = 'The attached image could not be loaded.';

/** Per-turn cache keyed by storage object path (positive and negative results). */
export type ImageResolutionCache = Map<string, Promise<ImageResolution>>;

export interface ResolveImagePartOptions {
  /**
   * Env-like object holding `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   * Defaults to `process.env`; tests inject a fake.
   */
  env?: object | undefined;
  /** Injection seam for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch | undefined;
  /** Share one cache across the parts of a single turn. */
  cache?: ImageResolutionCache | undefined;
  signal?: AbortSignal | null | undefined;
  /** Override the 5 MB cap (tests use small values). */
  maxBytes?: number | undefined;
}

export type ImageResolution =
  | { kind: 'inline'; mediaType: string; dataUrl: string; base64: string }
  | { kind: 'passthrough' }
  | { kind: 'unavailable' };

export function createImageResolutionCache(): ImageResolutionCache {
  return new Map();
}

/**
 * Classify and, for Kestrel-owned images, download one reference. This is the
 * core decision table shared by the provider-boundary middleware and the
 * part-level adapter below; the result is cached by storage path when a cache
 * is supplied.
 */
export async function resolveImageReference(
  reference: string,
  options: ResolveImagePartOptions = {},
): Promise<ImageResolution> {
  const classification = classifyImageReference(reference);
  if (classification === 'inline' || classification === 'foreign') {
    return { kind: 'passthrough' };
  }
  if (classification === 'undeliverable') return { kind: 'unavailable' };
  return resolveKestrelImage(reference, options);
}

type ImageReferenceClass = 'kestrel' | 'inline' | 'foreign' | 'undeliverable';

function classifyImageReference(reference: string): ImageReferenceClass {
  const trimmed = reference.trim();
  if (!trimmed) return 'undeliverable';
  if (/^data:/i.test(trimmed)) return 'inline';
  if (/^blob:/i.test(trimmed)) return 'undeliverable';

  const parsed = parseChatImageReference(trimmed);
  if (parsed === null) {
    // A value that names our bucket but does not normalise (traversal,
    // malformed segments) is refused outright; an unrecognised absolute URL
    // is the provider's to fetch; anything else is not deliverable at all.
    if (hasChatImageBucketMarker(trimmed)) return 'undeliverable';
    return isAbsoluteHttpUrl(trimmed) ? 'foreign' : 'undeliverable';
  }
  // A foreign host that merely happens to end in three path segments is not
  // ours; only an explicit Kestrel/Supabase bucket marker counts.
  if (parsed.absolute && !parsed.explicitBucketPath) return 'foreign';
  return 'kestrel';
}

async function resolveKestrelImage(
  reference: string,
  options: ResolveImagePartOptions,
): Promise<ImageResolution> {
  const parsed = parseChatImageReference(reference);
  if (parsed === null) return { kind: 'passthrough' };

  const cache = options.cache;
  const cached = cache?.get(parsed.storagePath);
  if (cached) return cached;

  const pending: Promise<ImageResolution> = fetchChatImageInline(parsed.storagePath, options);
  cache?.set(parsed.storagePath, pending);
  return pending;
}
