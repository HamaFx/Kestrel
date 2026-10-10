import { parseServerEnv } from '@kestrel/shared';
import { describe, expect, it } from 'vitest';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://user:password@localhost:5432/kestrel',
  AUTH_SECRET: 'a'.repeat(32),
  CRON_SECRET: 'c'.repeat(16),
  ENCRYPTION_SECRET: 'e'.repeat(32),
};

describe('multi-user boundary', () => {
  it('accepts the default multi-user configuration', () => {
    const env = parseServerEnv(base);

    expect(env.MULTI_USER_ENABLED).toBe(true);
    expect(env.KESTREL_ENABLE_RLS).toBe(true);
    expect(env.REGISTRATION_MODE).toBe('open');
  });

  it('rejects RLS disabled when multi-user is on', () => {
    expect(() =>
      parseServerEnv({ ...base, MULTI_USER_ENABLED: '1', KESTREL_ENABLE_RLS: '0' }),
    ).toThrow(/MULTI_USER_ENABLED.*KESTREL_ENABLE_RLS/);
  });

  it('rejects owner-first (removed mode)', () => {
    expect(() => parseServerEnv({ ...base, REGISTRATION_MODE: 'owner-first' })).toThrow(
      /owner-first is removed|REGISTRATION_MODE/,
    );
  });

  it('accepts disabled registration in multi-user mode', () => {
    const env = parseServerEnv({ ...base, REGISTRATION_MODE: 'disabled' });

    expect(env.REGISTRATION_MODE).toBe('disabled');
  });

  it('ignores a stale OSS_SINGLE_USER_MODE pin (removed flag)', () => {
    const env = parseServerEnv({ ...base, OSS_SINGLE_USER_MODE: '1' });

    expect('OSS_SINGLE_USER_MODE' in env).toBe(false);
    expect(env.MULTI_USER_ENABLED).toBe(true);
  });
});
