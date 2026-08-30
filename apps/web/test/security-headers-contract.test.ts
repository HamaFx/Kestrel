import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('security header and deployment contracts', () => {
  it('configures the baseline security headers', () => {
    const source = read('apps/web/next.config.mjs');

    expect(source).toContain("X-Frame-Options', value: 'DENY'");
    expect(source).toContain("X-Content-Type-Options', value: 'nosniff'");
    expect(source).toContain("Referrer-Policy', value: 'strict-origin-when-cross-origin'");
    expect(source).toContain("Strict-Transport-Security', value: 'max-age=31536000'");
    expect(source).toContain("key: 'Permissions-Policy'");
    expect(source).toContain("key: 'Content-Security-Policy'");
    expect(source).toContain("default-src 'self'");
    expect(source).toContain("frame-src 'self'");
  });

  it('sets the nonce CSP on middleware responses without unsafe inline scripts', () => {
    const source = read('apps/web/src/proxy.ts');

    expect(source).toContain('Content-Security-Policy');
    expect(source).toContain("nonce-${nonce}");
    expect(source).not.toContain("script-src 'self' 'nonce-${nonce}' 'unsafe-inline'");
  });

  it('keeps the worker health listener private and authenticated in deployment config', () => {
    const compose = read('docker-compose.yml');
    const vmCompose = read('infra/cron-vm/docker-compose.vm.yml');
    const workerDockerfile = read('Dockerfile.worker');

    expect(compose).toContain('port is intentionally not published by default');
    expect(compose).toContain('Authorization: Bearer $${WORKER_HEALTH_TOKEN}');
    expect(vmCompose).toContain('127.0.0.1:8081:8081');
    expect(vmCompose).not.toContain('0.0.0.0:8081');
    expect(workerDockerfile).toContain('Authorization: Bearer $${WORKER_HEALTH_TOKEN}');
  });
});
