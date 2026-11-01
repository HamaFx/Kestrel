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

// Audit 2026-10-31 (R7): GET /api/uploads/[[...path]] is the only reader for
// objects in the private `chat-images` bucket. These tests pin the invariant:
// an object is readable only by the owner of its `<userId>` prefix, and the
// legacy public URL shape rows still store keeps resolving for that owner.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/uploads/[[...path]]/route';
import type * as ApiModule from '@/lib/http/api';
import type * as ApiAuthModule from '@/lib/http/api/auth';

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
}));

// Set before any import-time `getServerEnv()` call can cache an env snapshot
// without the storage configuration, and restored afterwards because plain
// `process.env` writes leak across files in a reused worker process.
const envBackup = vi.hoisted(() => {
  const backup = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  return backup;
});

vi.mock('@/lib/http/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    getUserFromRequest: mocks.getUserFromRequest,
  };
});

vi.mock('@/lib/http/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiAuthModule>();
  return {
    ...actual,
    getUserFromRequest: mocks.getUserFromRequest,
  };
});

const USER_ID = 'user-123';
const OTHER_ID = 'user-999';
const STORAGE_PATH = 'user-123/2026-10-20/0a1b2c3d4e5f-chart.webp';
const PROXY_PATH = `/api/uploads/${STORAGE_PATH}`;
const LEGACY_PUBLIC_URL = `https://project.supabase.co/storage/v1/object/public/chat-images/${STORAGE_PATH}`;
const UPSTREAM_URL = `https://project.supabase.co/storage/v1/object/authenticated/chat-images/${STORAGE_PATH}`;

function params(...segments: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path: segments }) };
}

function getRequest(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  mocks.getUserFromRequest.mockResolvedValue({ userId: USER_ID });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('GET /api/uploads/[[...path]] ownership', () => {
  it('streams the object to its owner with a private cache header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/webp', 'content-length': '3' },
      }),
    );

    const response = await GET(
      getRequest(`https://kestrel.example.com${PROXY_PATH}`),
      params('user-123', '2026-10-20', '0a1b2c3d4e5f-chart.webp'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, max-age=600');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestedUrl, init] = fetchMock.mock.calls[0]!;
    expect(String(requestedUrl)).toBe(UPSTREAM_URL);
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer service-role-key');
  });

  it('returns 404 for another user and never contacts storage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    mocks.getUserFromRequest.mockResolvedValue({ userId: OTHER_ID });

    const response = await GET(
      getRequest(`https://kestrel.example.com${PROXY_PATH}`),
      params('user-123', '2026-10-20', '0a1b2c3d4e5f-chart.webp'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller has no session', async () => {
    mocks.getUserFromRequest.mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await GET(
      getRequest(`https://kestrel.example.com${PROXY_PATH}`),
      params('user-123', '2026-10-20', '0a1b2c3d4e5f-chart.webp'),
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/uploads/[[...path]] legacy references', () => {
  it('resolves a stored public URL through ?src= for its owner', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([9]), {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      }),
    );

    const response = await GET(
      getRequest(
        `https://kestrel.example.com/api/uploads?src=${encodeURIComponent(LEGACY_PUBLIC_URL)}`,
      ),
      params(),
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(UPSTREAM_URL);
  });

  it('rejects a legacy public URL that belongs to someone else', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    mocks.getUserFromRequest.mockResolvedValue({ userId: OTHER_ID });

    const response = await GET(
      getRequest(
        `https://kestrel.example.com/api/uploads?src=${encodeURIComponent(LEGACY_PUBLIC_URL)}`,
      ),
      params(),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed and traversal paths before touching storage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    for (const segments of [
      ['user-123', '2026-10-20'],
      ['user-123', 'not-a-day', 'chart.webp'],
      ['user-123', '2026-10-20', '..', 'chart.webp'],
      ['https:', '', 'evil.example.com', 'x.webp'],
    ]) {
      const response = await GET(
        getRequest('https://kestrel.example.com/api/uploads'),
        params(...segments),
      );
      expect(response.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a missing upstream object to 404 and a storage failure to 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{"error":"not_found"}', { status: 404 }),
    );
    const missing = await GET(
      getRequest(`https://kestrel.example.com${PROXY_PATH}`),
      params('user-123', '2026-10-20', '0a1b2c3d4e5f-chart.webp'),
    );
    expect(missing.status).toBe(404);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const broken = await GET(
      getRequest(`https://kestrel.example.com${PROXY_PATH}`),
      params('user-123', '2026-10-20', '0a1b2c3d4e5f-chart.webp'),
    );
    expect(broken.status).toBe(502);
  });

  it('never serves an unexpected content type inline', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const response = await GET(
      getRequest(`https://kestrel.example.com${PROXY_PATH}`),
      params('user-123', '2026-10-20', '0a1b2c3d4e5f-chart.webp'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
