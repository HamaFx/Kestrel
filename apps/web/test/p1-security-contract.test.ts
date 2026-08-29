import { readFileSync } from 'node:fs';
import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url).pathname;
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');

describe('P1 security contracts', () => {
  it('protects every admin route with the admin wrapper', () => {
    for (const path of globSync('src/app/api/admin/**/route.ts', { cwd: `${root}src/app/api` })) {
      const source = read(`src/app/api/admin/${path.replace(/^src\/app\/api\/admin\//, '')}`);
      expect(source, path).toContain('withAdminAuth');
    }
  });

  it('protects every cron route with the cron wrapper', () => {
    for (const path of globSync('src/app/api/cron/**/route.ts', { cwd: `${root}src/app/api` })) {
      const source = read(`src/app/api/cron/${path.replace(/^src\/app\/api\/cron\//, '')}`);
      expect(source, path).toContain('withCronAuth');
    }
  });

  it('does not permit inline scripts in the application CSP', () => {
    expect(read('src/proxy.ts')).not.toContain("script-src 'self' 'nonce-${nonce}' 'unsafe-inline'");
  });

  it('rejects SVG and active content in uploads', () => {
    const source = read('src/app/api/upload/route.ts');
    expect(source).toContain("'image/jpeg'");
    expect(source).toContain("'image/webp'");
    expect(source).not.toContain("'image/svg+xml'");
    expect(source).toContain('limitInputPixels');
  });
});
