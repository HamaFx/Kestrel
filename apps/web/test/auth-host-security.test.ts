import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const originalAuthMode = process.env.AUTH_MODE;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('NODE_ENV', originalNodeEnv);
  restore('AUTH_SECRET', originalAuthSecret);
  restore('NEXTAUTH_SECRET', originalNextAuthSecret);
  restore('AUTH_MODE', originalAuthMode);
});

describe('auth host and production security contract', () => {
  it('requires an explicit signing secret in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.AUTH_MODE = 'normal';

    const { assertProductionSecurity } = await import('../src/auth.config');
    expect(() => assertProductionSecurity()).toThrow(/AUTH_SECRET/);
  });

  it('rejects legacy auth in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SECRET = 'test-secret-that-is-long-enough';
    delete process.env.NEXTAUTH_SECRET;
    process.env.AUTH_MODE = 'legacy';

    const { assertProductionSecurity } = await import('../src/auth.config');
    expect(() => assertProductionSecurity()).toThrow(/AUTH_MODE=legacy/);
  });

  it('documents that trusted proxy host handling requires an explicit app URL', async () => {
    const source = readFileSync(resolve(process.cwd(), 'src/auth.config.ts'), 'utf8');
    expect(source).toContain('trustHost: true');
    expect(source).toMatch(/explicit application URL|NEXTAUTH_URL/);
  });
});
