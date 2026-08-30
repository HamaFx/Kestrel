import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generateImpersonationChallenge,
  verifyImpersonationChallenge,
} from '../src/lib/auth/impersonation';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('impersonation challenges', () => {
  it('round-trips a challenge with the configured secret', () => {
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    const challenge = generateImpersonationChallenge();
    expect(verifyImpersonationChallenge(challenge)).toBe(true);
  });

  it('rejects tampered challenges', () => {
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    const challenge = generateImpersonationChallenge();
    expect(verifyImpersonationChallenge(`${challenge}0`)).toBe(false);
  });

  it('fails closed without a secret', () => {
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    expect(() => generateImpersonationChallenge()).toThrow(/AUTH_SECRET/);
    expect(verifyImpersonationChallenge('1.invalid')).toBe(false);
  });
});
