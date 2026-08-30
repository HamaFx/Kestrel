import { describe, expect, it } from 'vitest';

async function runWithGuard<T>(running: Set<string>, name: string, work: () => Promise<T>) {
  if (running.has(name)) return { skipped: true as const };
  running.add(name);
  try {
    return { skipped: false as const, value: await work() };
  } finally {
    running.delete(name);
  }
}

describe('scheduler behavior invariants', () => {
  it('skips a concurrent invocation and permits a later retry', async () => {
    const running = new Set<string>();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runWithGuard(running, 'job', async () => {
      await blocked;
      return 'first';
    });
    await Promise.resolve();
    await expect(runWithGuard(running, 'job', async () => 'overlap')).resolves.toEqual({
      skipped: true,
    });
    release();
    await expect(first).resolves.toEqual({ skipped: false, value: 'first' });
    await expect(runWithGuard(running, 'job', async () => 'retry')).resolves.toEqual({
      skipped: false,
      value: 'retry',
    });
  });

  it('retains the guard until an uncooperative job settles', async () => {
    const running = new Set<string>();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runWithGuard(running, 'job', async () => {
      await pending;
    });
    await Promise.resolve();
    expect(running.has('job')).toBe(true);
    release();
    await first;
    expect(running.has('job')).toBe(false);
  });
});
