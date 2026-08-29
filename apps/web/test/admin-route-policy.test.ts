import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const apiRoot = resolve(root, 'apps/web/src/app/api');

function routeFiles(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) result.push(...routeFiles(path));
    else if (entry === 'route.ts') result.push(path);
  }
  return result;
}

describe('privileged route policy', () => {
  it('uses withAdminAuth for every API route under /api/admin', () => {
    const adminRoot = resolve(apiRoot, 'admin');
    for (const path of routeFiles(adminRoot)) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain('withAdminAuth');
    }
  });

  it('marks sensitive maintenance cron routes as admin-session protected', () => {
    const sensitive = [
      'cleanup-uploads',
      'cleanup-telemetry',
      'billing-dlq',
      'health-alerts',
      'alerts',
      'cleanup-tokens',
    ];
    for (const name of sensitive) {
      const path = resolve(apiRoot, 'cron', name, 'route.ts');
      expect(readFileSync(path, 'utf8'), path).toContain('requireAdminSession: true');
    }
  });
});
