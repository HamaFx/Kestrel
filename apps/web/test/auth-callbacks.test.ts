import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '../..');
const source = readFileSync(resolve(root, 'apps/web/src/lib/auth/callbacks.ts'), 'utf8');

describe('auth callback extraction', () => {
  it('keeps JWT session creation and fail-closed handling in the helper', () => {
    expect(source).toContain('createUserSession');
    expect(source).toContain("SESSION_SYSTEM_ERROR");
    expect(source).toContain('handleJwtCallback');
  });

  it('keeps session validation and database failure handling in the helper', () => {
    expect(source).toContain('validateSession');
    expect(source).toContain('session_database_unavailable');
    expect(source).toContain("expires: '0'");
  });

  it('delegates both callbacks from auth.ts', () => {
    const authSource = readFileSync(resolve(root, 'apps/web/src/auth.ts'), 'utf8');
    expect(authSource).toContain('handleJwtCallback(token, user)');
    expect(authSource).toContain('handleSessionCallback(session, token)');
  });
});
