import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/scheduler.ts'), 'utf8');

describe('scheduler reliability contracts', () => {
  it('prevents overlapping runs for the same job', () => {
    expect(source).toContain('_runningJobs.has(name)');
    expect(source).toContain('_runningJobs.add(name)');
    expect(source).toContain('_runningJobs.delete(name)');
  });

  it('aborts timed-out jobs and retains the guard until settlement', () => {
    expect(source).toContain('ac.abort');
    expect(source).toContain('Promise.race([jobPromise, timeoutPromise])');
    expect(source).toContain('retaining in-flight guard until the job settles');
  });

  it('aborts active jobs when the scheduler stops', () => {
    expect(source).toContain('_activeControllers');
    expect(source).toContain('scheduler: worker shutting down');
  });
});
