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

// Regression coverage for GET /api/news. The route previously used the
// unfinished compose()/authMiddleware chain, which never attached the
// authenticated user to the handler context, so every read failed with
// "Cannot read properties of undefined (reading 'userId')" → 500 (surfaced by
// the k6 smoke suite). It now uses the standard withAuth wrapper.

import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { GET } from '@/app/api/news/route';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const mockListRecentArticles = vi.hoisted(() => vi.fn());
const mockWithRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@kestrel/ai', () => ({
  listRecentArticles: mockListRecentArticles,
}));

vi.mock('@kestrel/db', () => ({
  withRateLimit: mockWithRateLimit,
  schema: {},
  getAdminDb: vi.fn(() => ({})),
  hasTenantDbScope: vi.fn(() => false),
  requireTenantIdForUser: vi.fn(async () => 'tenant-test'),
  withTenantDbFresh: vi.fn(async (_tenantId: string, work: (db: unknown) => Promise<unknown>) =>
    work({}),
  ),
}));

const USER_ID = 'test-user-001';

function article(index: number) {
  return {
    id: `article-${index}`,
    title: `Headline ${index}`,
    url: `https://example.com/${index}`,
    source: 'test',
    publishedAt: new Date(Date.now() - index * 60_000).toISOString(),
  };
}

beforeEach(() => {
  (auth as Mock).mockResolvedValue({
    user: { id: USER_ID, email: 'test@example.com' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
  mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 60 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/news', () => {
  it('returns the article page with pagination metadata', async () => {
    mockListRecentArticles.mockResolvedValue([article(0), article(1)]);

    const response = await GET(new Request('http://localhost/api/news'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    expect(body.nextOffset).toBe(2);
    expect(mockListRecentArticles).toHaveBeenCalledWith(21, 0, {});
  });

  it('flags hasMore and trims the look-ahead row when the page overflows', async () => {
    mockListRecentArticles.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => article(index)),
    );

    const response = await GET(new Request('http://localhost/api/news'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items).toHaveLength(20);
    expect(body.hasMore).toBe(true);
    expect(body.nextOffset).toBe(20);
  });

  it('passes the filters through to the article query', async () => {
    mockListRecentArticles.mockResolvedValue([]);

    const response = await GET(
      new Request('http://localhost/api/news?symbol=XAUUSD&sentiment=bullish&q=gold'),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect(mockListRecentArticles).toHaveBeenCalledWith(21, 0, {
      symbol: 'XAUUSD',
      sentiment: 'bullish',
      query: 'gold',
    });
  });

  it('returns 429 with Retry-After when the reader is rate limited', async () => {
    mockWithRateLimit.mockResolvedValue({ allowed: false, count: 61, limit: 60 });

    const response = await GET(new Request('http://localhost/api/news'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');

    const body = await response.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(mockListRecentArticles).not.toHaveBeenCalled();
  });

  it('returns 401 (not 500) when unauthenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/news'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
