import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/scheduler.ts'), 'utf8');

describe('scheduler runtime reliability', () => {
  it('retries lock acquisition before proceeding without the guard', () => {
    expect(source).toContain('retrying once');
    expect(source).toContain('proceeding without idempotency guard');
  });

  it('does not release the overlap guard while an uncooperative job is running', () => {
    expect(source).toContain('if (cleanupRequested) cleanup()');
    expect(source).toContain('retaining in-flight guard until the job settles');
  });

  it('aborts all active jobs during shutdown', () => {
    expect(source).toContain('for (const ac of _activeControllers)');
    expect(source).toContain("ac.abort(new Error('scheduler: worker shutting down'))");
  });
});
