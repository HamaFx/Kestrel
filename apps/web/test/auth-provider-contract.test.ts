import { describe, expect, it, vi } from 'vitest';

import { createAuthProviders } from '../src/lib/auth/providers';

vi.mock('@kestrel/ai', () => ({
  getDb: vi.fn(),
}));

describe('auth provider construction', () => {
  it('always creates the credentials provider', () => {
    const providers = createAuthProviders({});
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeDefined();
  });

  it('adds Google only when both credentials are configured', () => {
    expect(createAuthProviders({ AUTH_GOOGLE_ID: 'id' })).toHaveLength(1);
    expect(
      createAuthProviders({ AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 'secret' }),
    ).toHaveLength(2);
  });

  it('does not add impersonation in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENABLE_IMPERSONATION', 'true');
    vi.stubEnv('ALLOW_INSECURE_DEV_AUTH', 'true');
    expect(createAuthProviders({})).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});
