/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalEnableDevLogin = process.env.ENABLE_DEV_LOGIN;
const originalAllowDevLogin = process.env.ALLOW_DEV_LOGIN_IN_PRODUCTION;
const originalEnableImpersonation = process.env.ENABLE_IMPERSONATION;
const originalAllowInsecure = process.env.ALLOW_INSECURE_DEV_AUTH;
const originalAllowDebug = process.env.ALLOW_DEBUG_IN_PRODUCTION;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('production security boundaries', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEV_LOGIN;
    delete process.env.ALLOW_DEV_LOGIN_IN_PRODUCTION;
    delete process.env.ENABLE_IMPERSONATION;
    delete process.env.ALLOW_INSECURE_DEV_AUTH;
    delete process.env.ALLOW_DEBUG_IN_PRODUCTION;
  });

  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('ENABLE_DEV_LOGIN', originalEnableDevLogin);
    restoreEnv('ALLOW_DEV_LOGIN_IN_PRODUCTION', originalAllowDevLogin);
    restoreEnv('ENABLE_IMPERSONATION', originalEnableImpersonation);
    restoreEnv('ALLOW_INSECURE_DEV_AUTH', originalAllowInsecure);
    restoreEnv('ALLOW_DEBUG_IN_PRODUCTION', originalAllowDebug);
    vi.resetModules();
  });

  it('returns 404 for dev login in production before touching auth or the database', async () => {
    const signIn = vi.fn();
    const getUserById = vi.fn();
    const createUserWithSettings = vi.fn();
    vi.doMock('@/auth', () => ({ signIn }));
    vi.doMock('@/lib/services/api-boundary', () => ({ getUserById, createUserWithSettings }));
    vi.doMock('@/lib/logger', () => ({
      createScopedLoggerWithContext: () => ({
        warn: vi.fn(),
        info: vi.fn(),
        errorContext: vi.fn(),
      }),
    }));

    const { GET } = await import('@/app/api/dev/login/route');
    const response = await GET();

    expect(response.status).toBe(404);
    expect(signIn).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(createUserWithSettings).not.toHaveBeenCalled();
  });

  it('reports impersonation disabled in production', async () => {
    vi.doMock('@/lib/admin-auth', () => ({
      withAdminAuth:
        (handler: (request: Request, context: { user: { userId: string } }) => Promise<Response>) =>
        async (request: Request) =>
          handler(request, { user: { userId: 'admin' } }),
    }));
    vi.doMock('@/auth', () => ({
      generateImpersonationChallenge: vi.fn(),
      signIn: vi.fn(),
    }));
    vi.doMock('@/lib/api', () => ({ parseJsonBody: vi.fn() }));
    vi.doMock('@/lib/services/admin', () => ({ recordAdminAudit: vi.fn() }));
    vi.doMock('@/lib/services/api-boundary', () => ({ getUserById: vi.fn() }));

    const { POST } = await import('@/app/api/admin/impersonate/route');
    const response = await POST(
      new Request('http://localhost/api/admin/impersonate', {
        method: 'POST',
        body: JSON.stringify({ userId: 'target' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Impersonation is disabled' },
    });
  });

  it('reports impersonation disabled in the production probe', async () => {
    vi.doMock('@/lib/admin-auth', () => ({
      withAdminAuth: (handler: () => Promise<Response>) => () => handler(),
    }));

    const { GET } = await import('@/app/api/admin/impersonate/probe/route');
    const response = await GET(new Request('http://localhost/api/admin/impersonate/probe'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
  });

  it('returns 404 for the debug route in production', async () => {
    const { GET } = await import('@/app/debug/route');
    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
  });
});
