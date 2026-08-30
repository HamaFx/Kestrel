import { parseServerEnv } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

const baseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://user:password@localhost:5432/kestrel',
  AUTH_SECRET: 'a'.repeat(32),
  CRON_SECRET: 'c'.repeat(16),
  ENCRYPTION_SECRET: 'e'.repeat(32),
};

describe('OSS single-user runtime boundary', () => {
  it('accepts the default single-user configuration', () => {
    const env = parseServerEnv(baseEnv);

    expect(env.OSS_SINGLE_USER_MODE).toBe(true);
    expect(env.MULTI_USER_ENABLED).toBe(false);
    expect(env.KESTREL_ENABLE_RLS).toBe(false);
    expect(env.REGISTRATION_MODE).toBe('owner-first');
  });

  it('rejects shared mode when the OSS boundary is enabled', () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        OSS_SINGLE_USER_MODE: '1',
        MULTI_USER_ENABLED: '1',
        KESTREL_ENABLE_RLS: '1',
      }),
    ).toThrow(/OSS_SINGLE_USER_MODE.*Multi-user\/RLS mode is disabled/);
  });

  it('rejects open registration in OSS single-user mode', () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        OSS_SINGLE_USER_MODE: '1',
        REGISTRATION_MODE: 'open',
      }),
    ).toThrow(/OSS_SINGLE_USER_MODE.*Multi-user\/RLS mode is disabled|REGISTRATION_MODE=open/);
  });

  it('allows a future shared configuration only when the OSS boundary is disabled', () => {
    const env = parseServerEnv({
      ...baseEnv,
      OSS_SINGLE_USER_MODE: '0',
      MULTI_USER_ENABLED: '1',
      KESTREL_ENABLE_RLS: '1',
      REGISTRATION_MODE: 'open',
    });

    expect(env.OSS_SINGLE_USER_MODE).toBe(false);
    expect(env.MULTI_USER_ENABLED).toBe(true);
  });
});
