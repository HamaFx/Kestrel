/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn(() => ({ stop: vi.fn() })) },
}));

vi.mock('@kestrel/ai', () => ({
  getDb: vi.fn(() => ({ execute: vi.fn() })),
}));

vi.mock('../src/jobs/index', () => ({
  JOBS: {
    'test-job': { schedule: '* * * * *', run: vi.fn(async () => ({ processed: 5, note: 'ok' })) },
  },
}));

vi.mock('../src/cron-lock', () => ({ acquireCronLock: vi.fn() }));
vi.mock('../src/tenant-router', () => ({ tenantRouter: {} }));

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('JOB_TIMEOUT_MS', '5000');
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('exports a startScheduler function', async () => {
    const { startScheduler } = await import('../src/scheduler');
    expect(typeof startScheduler).toBe('function');
  });

  it('startScheduler returns a stop function', async () => {
    const { startScheduler } = await import('../src/scheduler');
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn(() => log) };
    const stop = startScheduler(log);
    expect(typeof stop).toBe('function');
    stop();
  });

  it('logs database cleanup errors without crashing scheduler startup', async () => {
    const ai = await import('@kestrel/ai');
    vi.mocked(ai.getDb).mockReturnValue({
      execute: vi.fn().mockRejectedValue(new Error('DB unavailable')),
    } as never);

    const { startScheduler } = await import('../src/scheduler');
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn(() => log) };
    const stop = startScheduler(log);
    expect(typeof stop).toBe('function');
    await new Promise((resolve) => setImmediate(resolve));
    stop();
    expect(log.warn).toHaveBeenCalled();
  });
});
