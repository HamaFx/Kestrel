import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withCronAuth } from '@/lib/http/cron';

const mockGetAuthEnv = vi.hoisted(() => vi.fn());
const mockGetUserFromRequest = vi.hoisted(() => vi.fn());
const mockGetAdminUser = vi.hoisted(() => vi.fn());
const mockWithRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env', () => ({ getAuthEnv: mockGetAuthEnv }));
vi.mock('@/lib/http/api', () => ({ getUserFromRequest: mockGetUserFromRequest }));
vi.mock('@/lib/auth/admin-auth', () => ({ getAdminUser: mockGetAdminUser }));
vi.mock('@kestrel/db', () => ({ withRateLimit: mockWithRateLimit }));
vi.mock('@/lib/logger', () => ({
  hasAdminDbScope: () => false,
  createScopedLoggerWithContext: () => ({ error: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthEnv.mockReturnValue({ CRON_SECRET: 'cron-secret' });
  mockGetUserFromRequest.mockResolvedValue(null);
  mockGetAdminUser.mockResolvedValue({ admin: null });
  mockWithRateLimit.mockResolvedValue({ allowed: true });
});

function cronRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/test', { headers });
}

describe('withCronAuth request correlation', () => {
  it('returns request id on unauthenticated failures', async () => {
    const response = await withCronAuth(
      new Request('http://localhost/api/cron/test', { headers: { 'x-request-id': 'cron-req-1' } }),
      async () => ({ processed: 1 }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBe('cron-req-1');
    expect(await response.json()).toMatchObject({
      error: { code: 'AUTH', requestId: 'cron-req-1' },
    });
  });

  it('returns request id on admin-session failures', async () => {
    mockGetUserFromRequest.mockResolvedValue({ userId: 'user-1' });

    const response = await withCronAuth(
      new Request('http://localhost/api/cron/test', { headers: { 'x-request-id': 'cron-req-2' } }),
      async () => ({ processed: 1 }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('x-request-id')).toBe('cron-req-2');
  });
});

describe('withCronAuth session policy (audit 2026-10-31, R4)', () => {
  it('rejects a non-admin session by default', async () => {
    mockGetUserFromRequest.mockResolvedValue({ userId: 'user-1' });

    const response = await withCronAuth(cronRequest(), async () => ({ processed: 1 }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('allows an admin session by default', async () => {
    mockGetUserFromRequest.mockResolvedValue({ userId: 'admin-1' });
    mockGetAdminUser.mockResolvedValue({ admin: { id: 'admin-1' } });

    const response = await withCronAuth(cronRequest(), async () => ({ processed: 7 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, processed: 7 });
  });

  it('allows any session when the route opts in with session: "any"', async () => {
    mockGetUserFromRequest.mockResolvedValue({ userId: 'user-1' });

    const response = await withCronAuth(cronRequest(), async () => ({ processed: 2 }), {
      session: 'any',
      sessionRateLimit: { group: 'cron_test_refresh', perMinute: 4 },
    });

    expect(response.status).toBe(200);
    expect(mockGetAdminUser).not.toHaveBeenCalled();
    expect(mockWithRateLimit).toHaveBeenCalledWith('user-1', 'cron_test_refresh', 4);
  });

  it('returns 429 when the per-user refresh limit is exhausted', async () => {
    mockGetUserFromRequest.mockResolvedValue({ userId: 'user-1' });
    mockWithRateLimit.mockResolvedValue({ allowed: false });

    const response = await withCronAuth(cronRequest(), async () => ({ processed: 2 }), {
      session: 'any',
      sessionRateLimit: { group: 'cron_test_refresh', perMinute: 4 },
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('passes the invocation context through to the handler', async () => {
    const handler = vi.fn().mockResolvedValue({ processed: 0 });

    await withCronAuth(cronRequest({ authorization: 'Bearer cron-secret' }), handler);
    expect(handler).toHaveBeenCalledWith({ via: 'bearer', userId: null });

    mockGetUserFromRequest.mockResolvedValue({ userId: 'admin-1' });
    mockGetAdminUser.mockResolvedValue({ admin: { id: 'admin-1' } });
    await withCronAuth(cronRequest(), handler);
    expect(handler).toHaveBeenCalledWith({ via: 'session', userId: 'admin-1' });
  });

  it('never calls the rate limiter for scheduler invocations', async () => {
    const response = await withCronAuth(
      cronRequest({ authorization: 'Bearer cron-secret' }),
      async () => ({ processed: 1 }),
      { session: 'any', sessionRateLimit: { group: 'cron_test_refresh', perMinute: 4 } },
    );

    expect(response.status).toBe(200);
    expect(mockWithRateLimit).not.toHaveBeenCalled();
  });
});

describe('withCronAuth fails closed without a secret', () => {
  it.each([undefined, '', '   '])(
    'rejects a matching empty bearer when CRON_SECRET is %p',
    async (secret) => {
      mockGetAuthEnv.mockReturnValue({ CRON_SECRET: secret });

      const response = await withCronAuth(cronRequest({ authorization: 'Bearer ' }), async () => ({
        processed: 1,
      }));

      expect(response.status).toBe(401);
    },
  );

  it('still accepts a real secret', async () => {
    const response = await withCronAuth(
      cronRequest({ authorization: 'Bearer cron-secret' }),
      async () => ({ processed: 1 }),
    );

    expect(response.status).toBe(200);
  });
});
