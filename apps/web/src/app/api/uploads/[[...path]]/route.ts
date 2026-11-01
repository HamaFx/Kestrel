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

// GET /api/uploads/[[...path]] — owner-checked streaming proxy for chat-image
// uploads (audit 2026-10-31, R7).
//
// The `chat-images` Supabase bucket is private. This route is the only way to
// read an object: it resolves the requested reference to a storage path,
// requires the authenticated caller's id to equal the object's `<userId>`
// prefix, then streams the bytes from Supabase Storage with the service-role
// key. Non-owners get 404 (`not found`), not 403, so the route is not an
// existence oracle for other users' uploads.
//
// Two reference shapes are accepted so rows written before the fix keep
// rendering:
//   - the storage path / proxy path / proxy URL produced since the fix
//     (`/api/uploads/<userId>/<day>/<file>`), and
//   - the legacy world-readable Supabase URL
//     (`https://<ref>.supabase.co/storage/v1/object/public/chat-images/...`)
//     via `?src=<url-encoded stored value>`.
//
// Auth uses `getUserFromRequest` rather than `withAuth`: this route reads no
// tenant data, so it must not open a tenant-scoped database transaction per
// image request.
//
// Operator note (see docs): the bucket MUST be private for this to mean
// anything. With the bucket still public, the legacy Supabase URL remains
// readable by anyone who has it; the proxy does not change that.

import { getServerEnv } from '@/lib/env';
import { getUserFromRequest } from '@/lib/http/api';
import { unauthorizedResponse } from '@/lib/http/api/auth';
import { CHAT_IMAGE_BUCKET_NAME, parseChatImageObjectPath } from '@/lib/http/chat-image-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface UploadProxyParams {
  path?: string[];
}

/** Only raster types the uploader can produce are served inline. */
const INLINE_MEDIA_TYPE_PATTERN = /^image\/(jpeg|png|webp|gif)$/;
/** Browser cache window for an immutable object (paths are random-prefixed). */
const CACHE_CONTROL = 'private, max-age=600';

export async function GET(
  req: Request,
  ctx: { params: Promise<UploadProxyParams> },
): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse(req);

  const segments = (await ctx.params).path ?? [];
  const legacySrc = new URL(req.url).searchParams.get('src');
  const storagePath = parseChatImageObjectPath(legacySrc !== null ? legacySrc : segments.join('/'));
  if (storagePath === null) return notFound();

  const owner = storagePath.slice(0, storagePath.indexOf('/'));
  if (owner !== user.userId) return notFound();

  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return errorJson(503, 'IMAGE_UPLOADS_UNAVAILABLE', 'Image storage is not configured');
  }

  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const objectUrl = `${base}/storage/v1/object/authenticated/${CHAT_IMAGE_BUCKET_NAME}/${encodeObjectPath(storagePath)}`;

  let upstream: Response;
  try {
    upstream = await fetch(objectUrl, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
  } catch {
    return errorJson(502, 'IMAGE_STORAGE_UNAVAILABLE', 'Image storage is unreachable');
  }

  if (upstream.status === 404 || upstream.status === 400) {
    return notFound();
  }
  if (!upstream.ok || !upstream.body) {
    return errorJson(502, 'IMAGE_STORAGE_UNAVAILABLE', 'Image storage returned an error');
  }

  const upstreamType = (upstream.headers.get('content-type') ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase();
  const contentType = INLINE_MEDIA_TYPE_PATTERN.test(upstreamType)
    ? upstreamType
    : 'application/octet-stream';

  const headers = new Headers({
    'content-type': contentType,
    'cache-control': CACHE_CONTROL,
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('content-length', contentLength);

  return new Response(upstream.body, { status: 200, headers });
}

function encodeObjectPath(storagePath: string): string {
  return storagePath.split('/').map(encodeURIComponent).join('/');
}

function notFound(): Response {
  return errorJson(404, 'NOT_FOUND', 'Upload not found');
}

function errorJson(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}
