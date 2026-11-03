import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withCronAuth } from '@/lib/http/cron';

const CRON_SECRET = 'cron-secret-0123456789';

const mockGetAuthEnv = vi.hoisted(() => vi.fn());
const mockGetUserFromRequest = vi.hoisted(() => vi.fn());
const mockGetAdminUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env', () => ({ getAuthEnv: mockGetAuthEnv }));
vi.mock('@/lib/http/api', () => ({ getUserFromRequest: mockGetUserFromRequest }));
vi.mock('@/lib/auth/admin-auth', () => ({ getAdminUser: mockGetAdminUser }));
vi.mock('@/lib/logger', () => ({
  hasAdminDbScope: () => false,
  createScopedLoggerWithContext: () => ({ error: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthEnv.mockReturnValue({ CRON_SECRET });
  mockGetUserFromRequest.mockResolvedValue(null);
  mockGetAdminUser.mockResolvedValue({ admin: null });
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

describe('withCronAuth session policy (Phase 1, Task 1.3)', () => {
  it('rejects a non-admin session', async () => {
    mockGetUserFromRequest.mockResolvedValue({ userId: 'user-1' });

    const response = await withCronAuth(cronRequest(), async () => ({ processed: 1 }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('allows an admin session', async () => {
    mockGetUserFromRequest.mockResolvedValue({ userId: 'admin-1' });
    mockGetAdminUser.mockResolvedValue({ admin: { id: 'admin-1' } });

    const response = await withCronAuth(cronRequest(), async () => ({ processed: 7 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, processed: 7 });
  });

  it('passes the invocation context through to the handler', async () => {
    const handler = vi.fn().mockResolvedValue({ processed: 0 });

    await withCronAuth(cronRequest({ authorization: `Bearer ${CRON_SECRET}` }), handler);
    expect(handler).toHaveBeenCalledWith({ via: 'bearer', userId: null });

    mockGetUserFromRequest.mockResolvedValue({ userId: 'admin-1' });
    mockGetAdminUser.mockResolvedValue({ admin: { id: 'admin-1' } });
    await withCronAuth(cronRequest(), handler);
    expect(handler).toHaveBeenCalledWith({ via: 'session', userId: 'admin-1' });
  });
});

describe('withCronAuth fails closed without a usable secret', () => {
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

  it('rejects a secret shorter than 16 characters even when it matches', async () => {
    const shortSecret = 'short-secret';
    mockGetAuthEnv.mockReturnValue({ CRON_SECRET: shortSecret });
    mockGetUserFromRequest.mockResolvedValue(null);

    const response = await withCronAuth(
      cronRequest({ authorization: `Bearer ${shortSecret}` }),
      async () => ({ processed: 1 }),
    );

    expect(response.status).toBe(401);
  });

  it('rejects the literal Bearer undefined string', async () => {
    mockGetAuthEnv.mockReturnValue({ CRON_SECRET: undefined });

    const response = await withCronAuth(
      cronRequest({ authorization: 'Bearer undefined' }),
      async () => ({ processed: 1 }),
    );

    expect(response.status).toBe(401);
  });

  it('still accepts a long enough secret', async () => {
    const response = await withCronAuth(
      cronRequest({ authorization: `Bearer ${CRON_SECRET}` }),
      async () => ({ processed: 1 }),
    );

    expect(response.status).toBe(200);
  });
});
