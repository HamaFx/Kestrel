/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as cronLockModule from '../src/cron-lock';
import { JOBS } from '../src/jobs/index';
import { runJob } from '../src/runner/cli';

// Mock DB and external services
vi.mock('@kestrel/shared/vault', () => ({
  loadSecretsFromVault: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@kestrel/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/ai')>();
  return {
    ...actual,
    initLangfuse: vi.fn(),
    shutdownLangfuse: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn(() => ({})),
  };
});

vi.mock('@kestrel/ai/mastra', () => ({
  flushMastraObservability: vi.fn().mockResolvedValue(undefined),
  getKestrelMastra: vi.fn(() => ({ instance: {} })),
  closeKestrelMastra: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/db')>();
  return {
    ...actual,
    closeDb: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../src/healthchecks', () => ({
  ping: vi.fn().mockResolvedValue(undefined),
  withHeartbeat: vi.fn(async (_uuid, fn) => fn()),
}));

describe('worker CLI runner cron locks & timeouts (F-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEPLOYED_SHA = 'test-sha';
    process.env.KESTREL_ADMIN_TOKEN = 'secret';
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips execution when acquireCronLock returns null (already ran today)', async () => {
    const acquireSpy = vi.spyOn(cronLockModule, 'acquireCronLock').mockResolvedValue(null);
    const mockRun = vi.fn();
    const originalRun = JOBS.snapshots.run;
    JOBS.snapshots.run = mockRun;

    try {
      const exitCode = await runJob('snapshots');
      expect(exitCode).toBe(0);
      expect(acquireSpy).toHaveBeenCalledWith('snapshots', expect.anything());
      expect(mockRun).not.toHaveBeenCalled();
    } finally {
      JOBS.snapshots.run = originalRun;
    }
  });

  it('acquires lock, runs job, and calls lock.done on success', async () => {
    const doneMock = vi.fn().mockResolvedValue(undefined);
    const failMock = vi.fn().mockResolvedValue(undefined);
    const acquireSpy = vi.spyOn(cronLockModule, 'acquireCronLock').mockResolvedValue({
      done: doneMock,
      fail: failMock,
    });

    const mockRun = vi.fn().mockResolvedValue({ processed: 5, note: 'ok' });
    const originalRun = JOBS.snapshots.run;
    JOBS.snapshots.run = mockRun;

    try {
      const exitCode = await runJob('snapshots');
      expect(exitCode).toBe(0);
      expect(acquireSpy).toHaveBeenCalledWith('snapshots', expect.anything());
      expect(mockRun).toHaveBeenCalledTimes(1);
      expect(doneMock).toHaveBeenCalledWith('ok');
      expect(failMock).not.toHaveBeenCalled();
    } finally {
      JOBS.snapshots.run = originalRun;
    }
  });

  it('calls lock.fail and returns 2 on error', async () => {
    const doneMock = vi.fn().mockResolvedValue(undefined);
    const failMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(cronLockModule, 'acquireCronLock').mockResolvedValue({
      done: doneMock,
      fail: failMock,
    });

    const mockRun = vi.fn().mockRejectedValue(new Error('Job crash'));
    const originalRun = JOBS.snapshots.run;
    JOBS.snapshots.run = mockRun;

    try {
      const exitCode = await runJob('snapshots');
      expect(exitCode).toBe(2);
      expect(failMock).toHaveBeenCalledWith(expect.any(Error));
      expect(doneMock).not.toHaveBeenCalled();
    } finally {
      JOBS.snapshots.run = originalRun;
    }
  });

  it('aborts signal on job timeout', async () => {
    process.env.JOB_TIMEOUT_MS = '1000';
    let receivedSignal: AbortSignal | undefined;

    const mockRun = vi.fn().mockImplementation(async (ctx: { signal?: AbortSignal }) => {
      receivedSignal = ctx.signal;
      await new Promise((resolve) => setTimeout(resolve, 1100));
      return { processed: 0, note: 'done' };
    });
    const originalRun = JOBS.alerts.run;
    JOBS.alerts.run = mockRun;

    try {
      const exitCode = await runJob('alerts');
      expect(exitCode).toBe(0);
      expect(receivedSignal?.aborted).toBe(true);
    } finally {
      JOBS.alerts.run = originalRun;
      delete process.env.JOB_TIMEOUT_MS;
    }
  });
});
