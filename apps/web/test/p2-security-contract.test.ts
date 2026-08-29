import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('P2 security and reliability contracts', () => {
  it('purges user-owned data and anonymizes authentication material', () => {
    const auth = read('packages/db/src/queries/auth.ts');
    expect(auth).toContain('export async function deleteUserAccount');
    expect(auth).toContain('deletedAt: now');
    expect(auth).toContain('hashedPassword: null');
    expect(auth).toContain('twoFactorSecret: null');
    expect(auth).toContain('await tx.delete(schema.chatThreads)');
    expect(auth).toContain('await tx.delete(schema.diagnosticTraces)');
  });

  it('bounds retention windows and deletes terminal records only', () => {
    const retention = read('packages/db/src/retention.ts');
    expect(retention).toContain('MAX_RETENTION_DAYS = 3_650');
    expect(retention).toContain("status IN ('completed', 'dead')");
    expect(retention).toContain('completed_at IS NOT NULL');
    expect(retention).toContain('replayed_at IS NOT NULL');
    expect(retention).toContain('LIMIT ${batchSize}');
  });

  it('clears account-scoped browser state before logout', () => {
    const isolation = read('apps/web/src/lib/cache-isolation.ts');
    const nav = read('apps/web/src/components/layout/nav-drawer.tsx');
    expect(isolation).toContain('localStorage.removeItem');
    expect(isolation).toContain('sessionStorage.clear');
    expect(isolation).toContain('caches.delete');
    expect(nav).toContain('clearKestrelClientState');
  });

  it('does not allow notification clicks to navigate off-origin', () => {
    const sw = read('apps/web/scripts/sw.template.js');
    expect(sw).toContain("targetValue.startsWith('/')");
  });

  it('retains worker shutdown and non-overlapping flush safeguards', () => {
    const worker = read('apps/worker/src/index.ts');
    const scheduler = read('apps/worker/src/scheduler.ts');
    expect(worker).toContain('clearTimeout(flushTimer)');
    expect(worker).toContain('await Promise.all([consumer.stop(), binanceConsumer.stop()])');
    expect(scheduler).toContain('_runningJobs.has(name)');
    expect(scheduler).toContain('_activeControllers');
    expect(scheduler).toContain('ac.abort');
  });
});
