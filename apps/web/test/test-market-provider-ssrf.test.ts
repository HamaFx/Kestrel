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

// Audit 2026-10-31 (R12) — /api/settings/test-market-provider must never turn
// a caller-supplied value into the base URL the server fetches.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/settings/test-market-provider/route';

const { mockTestConnection, mockWithRateLimit, mockGet } = vi.hoisted(() => ({
  mockTestConnection: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('@/lib/http/api', () => ({
  withAuth:
    (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    (req: Request) =>
      handler(req, { user: { userId: 'user-1' } }),
  parseJsonBody: async (req: Request, schema: { parse: (v: unknown) => unknown }) =>
    schema.parse(await req.json()),
  errorResponse: () => Response.json({ ok: false, error: 'invalid body' }, { status: 400 }),
}));

vi.mock('@/lib/services/market', () => ({
  marketDataProviders: { get: mockGet },
}));
vi.mock('@/lib/services/rate-limit', () => ({
  withRateLimit: mockWithRateLimit,
}));

function post(body: unknown): Request {
  return new Request('http://localhost/api/settings/test-market-provider', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWithRateLimit.mockResolvedValue({ allowed: true });
  mockTestConnection.mockResolvedValue({ ok: true });
  mockGet.mockReturnValue({ testConnection: mockTestConnection });
});

describe('POST /api/settings/test-market-provider', () => {
  it('passes no options when the body has no apiKey', async () => {
    const res = await POST(post({ provider: 'biquote' }));

    expect(res.status).toBe(200);
    expect(mockTestConnection).toHaveBeenCalledWith(undefined);
  });

  it('never forwards a caller-supplied value as a base URL (R12)', async () => {
    const res = await POST(
      post({ provider: 'biquote', apiKey: 'http://169.254.169.254/latest/meta-data/' }),
    );

    expect(res.status).toBe(200);
    const [opts] = mockTestConnection.mock.calls[0] as [Record<string, unknown> | undefined];
    expect(opts).toEqual({ apiKey: 'http://169.254.169.254/latest/meta-data/' });
    expect(opts).not.toHaveProperty('baseUrl');
  });

  it('rate-limits per user', async () => {
    mockWithRateLimit.mockResolvedValue({ allowed: false });

    const res = await POST(post({ provider: 'biquote' }));

    expect(res.status).toBe(429);
    expect(mockTestConnection).not.toHaveBeenCalled();
    expect(mockWithRateLimit).toHaveBeenCalledWith('user-1', 'market_provider_test', 10);
  });

  it('rejects an unknown provider', async () => {
    mockGet.mockImplementation(() => {
      throw new Error('unknown provider');
    });

    const res = await POST(post({ provider: 'biquote' }));

    expect(res.status).toBe(400);
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it('surfaces a failed probe as a 400 without leaking the URL', async () => {
    mockTestConnection.mockResolvedValue({ ok: false, error: 'fetch failed' });

    const res = await POST(post({ provider: 'biquote' }));
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('fetch failed');
  });
});
