import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('runtime security header contracts', () => {
  it('keeps production headers present in the Next.js response configuration', () => {
    const source = read('apps/web/next.config.mjs');
    for (const header of [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'Cross-Origin-Opener-Policy',
      'Cross-Origin-Resource-Policy',
      'Permissions-Policy',
      'Content-Security-Policy',
    ]) {
      expect(source).toContain(`key: '${header}'`);
    }
  });

  it('uses a per-request nonce and does not permit unsafe-eval in proxy CSP', () => {
    const source = read('apps/web/src/proxy.ts');
    expect(source).toContain('crypto.randomUUID');
    expect(source).toContain('setCspHeader(next, cspNonce)');
    expect(source).toContain("script-src 'self' 'nonce-${nonce}'");
    expect(source).not.toContain("'unsafe-eval'");
  });
});
