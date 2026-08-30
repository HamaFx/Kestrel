import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withCronAuth } from '@/lib/cron';

const mockGetAuthEnv = vi.hoisted(() => vi.fn());
const mockGetUserFromRequest = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env', () => ({ getAuthEnv: mockGetAuthEnv }));
vi.mock('@/lib/api', () => ({ getUserFromRequest: mockGetUserFromRequest }));
vi.mock('@/lib/logger', () => ({
  createScopedLoggerWithContext: () => ({ error: vi.fn() }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthEnv.mockReturnValue({ CRON_SECRET: 'cron-secret' });
  mockGetUserFromRequest.mockResolvedValue(null);
});

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
    vi.doMock('@/lib/admin-auth', () => ({
      getAdminUser: vi.fn().mockResolvedValue({ admin: null }),
    }));

    const response = await withCronAuth(
      new Request('http://localhost/api/cron/test', { headers: { 'x-request-id': 'cron-req-2' } }),
      async () => ({ processed: 1 }),
      { requireAdminSession: true },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('x-request-id')).toBe('cron-req-2');
  });
});
