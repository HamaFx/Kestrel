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

// Audit 2026-10-31 (R7) — the shared image resolver must make Kestrel-owned
// screenshots consumable by a model provider without making the bucket public
// again, and must degrade to an honest note when it cannot.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasChatImageBucketMarker,
  parseChatImageReference,
} from '../src/media/chat-image-object-path';
import {
  CHAT_IMAGE_UNAVAILABLE_TEXT,
  createImageResolutionCache,
  resolveImagePartForProvider,
  resolveImageReference,
} from '../src/media/resolve-image-part';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const STORAGE_PATH = 'user-1/2026-11-01/ab12cd34ef56-chart.png';
const PROXY_URL = `https://app.example.com/api/uploads/${STORAGE_PATH}`;
const PROXY_PATH = `/api/uploads/${STORAGE_PATH}`;
const LEGACY_PUBLIC_URL = `https://project.supabase.co/storage/v1/object/public/chat-images/${STORAGE_PATH}`;
const AUTHENTICATED_URL = `https://project.supabase.co/storage/v1/object/authenticated/chat-images/${STORAGE_PATH}`;
const FOREIGN_URL = 'https://images.example.com/chart.png';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64');
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

const OBJECT_ENDPOINT = `https://project.supabase.co/storage/v1/object/authenticated/chat-images/${STORAGE_PATH}`;

function imagePart(url: string, mediaType = 'image/png'): Record<string, unknown> {
  return { type: 'file', url, mediaType };
}

function storageResponse(
  bytes: Uint8Array<ArrayBuffer> = PNG_BYTES,
  contentType = 'image/png',
): Response {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

describe('parseChatImageReference (R7 mirror)', () => {
  it.each([
    [STORAGE_PATH, STORAGE_PATH],
    [PROXY_PATH, STORAGE_PATH],
    [PROXY_URL, STORAGE_PATH],
    [`${PROXY_URL}?v=2#frag`, STORAGE_PATH],
    [LEGACY_PUBLIC_URL, STORAGE_PATH],
    [AUTHENTICATED_URL, STORAGE_PATH],
  ])('parses %s to the canonical storage path', (input, expected) => {
    expect(parseChatImageReference(input)?.storagePath).toBe(expected);
  });

  it.each([
    ['data:image/png;base64,AAAA', 'data URL'],
    ['blob:https://app.example.com/1234', 'blob URL'],
    [FOREIGN_URL, 'foreign host'],
    ['user-1/2026-11-01/..%2f..%2fsecret', 'traversal'],
    ['user-1/not-a-day/file.png', 'invalid day'],
    ['user-1/2026-11-01/', 'missing object name'],
    ['only-two/segments', 'wrong segment count'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(parseChatImageReference(input)).toBeNull();
  });

  it('flags marker-carrying values even when the path does not normalise', () => {
    expect(hasChatImageBucketMarker(`${PROXY_URL}/../../etc/passwd`)).toBe(true);
    expect(hasChatImageBucketMarker(FOREIGN_URL)).toBe(false);
  });
});

describe('resolveImagePartForProvider (R7)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('inlines bytes for a proxy URL, fetching the bucket with the service-role key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse());

    const resolved = await resolveImagePartForProvider(
      { ...imagePart(PROXY_URL), filename: 'chart.png' },
      { env: ENV },
    );

    expect(resolved).toEqual({
      type: 'file',
      mediaType: 'image/png',
      url: PNG_DATA_URL,
      filename: 'chart.png',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(OBJECT_ENDPOINT);
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { authorization: 'Bearer service-role-key' },
    });
  });

  it.each([
    ['relative proxy path', PROXY_PATH],
    ['bare storage path', STORAGE_PATH],
    ['legacy public URL', LEGACY_PUBLIC_URL],
    ['authenticated URL', AUTHENTICATED_URL],
    ['proxy URL on another host', `https://other.example.com/api/uploads/${STORAGE_PATH}`],
  ])('inlines %s identically', async (_label, reference) => {
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse());

    const resolved = await resolveImagePartForProvider(imagePart(reference), { env: ENV });

    expect(resolved).toEqual({ type: 'file', mediaType: 'image/png', url: PNG_DATA_URL });
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(OBJECT_ENDPOINT);
  });

  it('uses the upstream content type as the authoritative media type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse(PNG_BYTES, 'image/webp'));

    const resolved = await resolveImagePartForProvider(imagePart(PROXY_URL, 'image/jpeg'), {
      env: ENV,
    });

    expect(resolved).toMatchObject({ type: 'file', mediaType: 'image/webp' });
  });

  it.each([
    ['foreign URL', FOREIGN_URL],
    [
      'foreign URL with a three-segment path',
      'https://images.example.com/user-1/2026-11-01/chart.png',
    ],
    ['data URL', PNG_DATA_URL],
  ])('passes %s through untouched without a fetch', async (_label, reference) => {
    const part = imagePart(reference);

    const resolved = await resolveImagePartForProvider(part, { env: ENV });

    expect(resolved).toEqual(part);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a foreign URL that claims the Kestrel bucket marker for another host', async () => {
    // The fetch host always comes from SUPABASE_URL, never from the reference;
    // a marker-carrying foreign URL resolves against our own bucket instead.
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse());

    const resolved = await resolveImagePartForProvider(
      imagePart(`https://evil.example.com/api/uploads/${STORAGE_PATH}`),
      { env: ENV },
    );

    expect(resolved).toMatchObject({ type: 'file', url: PNG_DATA_URL });
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(OBJECT_ENDPOINT);
  });

  it('degrades a marker-carrying traversal reference to the honest note', async () => {
    const resolved = await resolveImagePartForProvider(
      imagePart(`https://app.example.com/api/uploads/user-1/2026-11-01/..%2f..%2fetc%2fpasswd`),
      { env: ENV },
    );

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['blob URL', 'blob:https://app.example.com/1234'],
    ['relative non-Kestrel path', '/images/chart.png'],
    ['empty reference', ''],
  ])('degrades %s to the honest note without a fetch', async (_label, reference) => {
    const resolved = await resolveImagePartForProvider(imagePart(reference), { env: ENV });

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades a file part with no reference at all to the honest note', async () => {
    const resolved = await resolveImagePartForProvider(
      { type: 'file', mediaType: 'image/png' },
      { env: ENV },
    );

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
  });

  it('returns null for non-image parts so callers can leave them untouched', async () => {
    expect(
      await resolveImagePartForProvider({ type: 'text', text: 'hi' }, { env: ENV }),
    ).toBeNull();
    expect(
      await resolveImagePartForProvider(imagePart(PROXY_URL, 'application/pdf'), { env: ENV }),
    ).toBeNull();
    expect(await resolveImagePartForProvider(null, { env: ENV })).toBeNull();
  });

  it('is unavailable without storage credentials', async () => {
    const resolved = await resolveImagePartForProvider(imagePart(PROXY_URL), {
      env: { SUPABASE_URL: ENV.SUPABASE_URL },
    });

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('degrades a missing object (404) to the honest note', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('not found', { status: 404 }));

    const resolved = await resolveImagePartForProvider(imagePart(PROXY_URL), { env: ENV });

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
  });

  it('degrades an unreachable storage upstream to the honest note', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('socket hang up'));

    const resolved = await resolveImagePartForProvider(imagePart(PROXY_URL), { env: ENV });

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
  });

  it('refuses a non-raster upstream content type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      storageResponse(new Uint8Array([1, 2, 3]), 'image/svg+xml'),
    );

    const resolved = await resolveImagePartForProvider(imagePart(PROXY_URL), { env: ENV });

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
  });

  it('refuses an oversize object declared by content-length', async () => {
    const oversize = new Uint8Array(32);
    const response = new Response(oversize, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '1048576' },
    });
    vi.mocked(fetch).mockResolvedValueOnce(response);

    const resolved = await resolveImagePartForProvider(imagePart(PROXY_URL), {
      env: ENV,
      maxBytes: 16,
    });

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
  });

  it('caps a streaming body once it exceeds the byte limit', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse(new Uint8Array(32)));

    const resolved = await resolveImagePartForProvider(imagePart(PROXY_URL), {
      env: ENV,
      maxBytes: 16,
    });

    expect(resolved).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
  });

  it('caches per storage path, including failures, within one caller cache', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse());
    const cache = createImageResolutionCache();

    const [first, second] = await Promise.resolve([
      await resolveImagePartForProvider(imagePart(PROXY_URL), { env: ENV, cache }),
      await resolveImagePartForProvider(imagePart(LEGACY_PUBLIC_URL), { env: ENV, cache }),
    ]);

    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.mocked(fetch).mockResolvedValueOnce(new Response('gone', { status: 404 }));
    const failingCache = createImageResolutionCache();
    const [a, b] = await Promise.all([
      resolveImagePartForProvider(imagePart(PROXY_URL), { env: ENV, cache: failingCache }),
      resolveImagePartForProvider(imagePart(PROXY_PATH), { env: ENV, cache: failingCache }),
    ]);
    expect(a).toEqual({ type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT });
    expect(b).toEqual(a);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('resolveImageReference (R7)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns inline bytes with both the data URL and the raw base64', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse());

    const resolution = await resolveImageReference(PROXY_URL, { env: ENV });

    expect(resolution).toEqual({
      kind: 'inline',
      mediaType: 'image/png',
      dataUrl: PNG_DATA_URL,
      base64: PNG_BASE64,
    });
  });

  it.each([
    ['foreign URL', FOREIGN_URL],
    ['already-inline data URL', PNG_DATA_URL],
  ])('passes %s through', async (_label, reference) => {
    const resolution = await resolveImageReference(reference, { env: ENV });

    expect(resolution).toEqual({ kind: 'passthrough' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports unavailable for a failed storage read', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

    const resolution = await resolveImageReference(PROXY_URL, { env: ENV });

    expect(resolution).toEqual({ kind: 'unavailable' });
  });

  it('dedupes repeated references through the caller cache', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(storageResponse());
    const cache = createImageResolutionCache();

    const first = await resolveImageReference(PROXY_URL, { env: ENV, cache });
    const second = await resolveImageReference(LEGACY_PUBLIC_URL, { env: ENV, cache });

    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
