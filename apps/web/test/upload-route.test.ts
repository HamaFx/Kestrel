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

// Audit 2026-10-31 (R7): POST /api/upload must hand back an app-owned,
// owner-checked proxy URL (never a Supabase public URL), and must reject
// `image/svg+xml` exactly like the storage helper now does.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/upload/route';

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_APP_URL'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>;

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
}));

vi.mock('@/lib/http/api', () => ({
  withAuth:
    (
      handler: (
        req: Request,
        ctx: { params: Promise<unknown>; user: unknown },
      ) => Promise<Response>,
    ) =>
    (req: Request, ctx?: { params?: Promise<unknown> }) =>
      handler(req, {
        params: ctx?.params ?? Promise.resolve({}),
        user: { userId: 'user-123' },
      }),
  errorResponse: (error: unknown) =>
    Response.json(
      {
        error: {
          code: 'ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      {
        status:
          typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 500,
      },
    ),
}));

vi.mock('@/lib/services/api-boundary', () => {
  class AppError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return {
    AppError,
    validationError: (message: string) => new AppError('VALIDATION', message, 400),
    providerUnavailable: (message: string) => new AppError('PROVIDER_UNAVAILABLE', message, 503),
    withRateLimit: mocks.withRateLimit,
  };
});

vi.mock('sharp', () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    webp: () => chain,
    toBuffer: async () => new Uint8Array([1, 2, 3, 4]),
  };
  return { default: () => chain };
});

function uploadRequest(file: File): Request {
  const form = new FormData();
  form.append('file', file);
  return new Request('http://localhost/api/upload', { method: 'POST', body: form });
}

function png(): File {
  return new File([new Uint8Array([1, 2, 3])], 'chart.png', { type: 'image/png' });
}

async function errorStatus(response: Response): Promise<number> {
  return response.status;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.NEXT_PUBLIC_APP_URL = 'https://kestrel.example.com';
  mocks.withRateLimit.mockResolvedValue({ allowed: true });
});

// Plain `process.env` writes leak across files in a reused worker process.
afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('POST /api/upload', () => {
  it('returns an absolute owner-proxy URL, not a Supabase public URL', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const response = await POST(uploadRequest(png()), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; path: string; mediaType: string };
    expect(body.url).toMatch(
      /^https:\/\/kestrel\.example\.com\/api\/uploads\/user-123\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{12}-chart\.webp$/,
    );
    expect(body.url).not.toContain('supabase.co');
    expect(body.url.endsWith(body.path)).toBe(true);
    expect(body.mediaType).toBe('image/webp');

    const uploadUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(uploadUrl).toContain('/storage/v1/object/chat-images/user-123/');
    expect(uploadUrl).not.toContain('/object/public/');
  });

  it('rejects image/svg+xml before writing anything', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'chart.svg', {
      type: 'image/svg+xml',
    });

    const response = await POST(uploadRequest(svg), { params: Promise.resolve({}) });

    expect(await errorStatus(response)).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the per-user upload limit is exhausted', async () => {
    mocks.withRateLimit.mockResolvedValue({ allowed: false });
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await POST(uploadRequest(png()), { params: Promise.resolve({}) });

    expect(await errorStatus(response)).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
