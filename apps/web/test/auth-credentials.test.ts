import { describe, expect, it } from 'vitest';

import {
  DUMMY_PASSWORD_HASH,
  normalizeCredential,
  normalizeEmail,
} from '../src/lib/auth/credentials';

describe('credential helpers', () => {
  it('normalizes email casing and surrounding whitespace', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('rejects non-string credential values without throwing', () => {
    expect(normalizeCredential(undefined)).toBe('');
    expect(normalizeCredential(null)).toBe('');
    expect(normalizeCredential(42)).toBe('');
  });

  it('keeps the dummy hash in bcrypt format', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2b\$12\$/);
  });
});
