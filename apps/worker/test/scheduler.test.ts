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

// Mock external dependencies
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({ stop: vi.fn() })),
  },
}));

vi.mock('@kestrel/ai', () => ({
  getDb: vi.fn(() => ({
    execute: vi.fn(),
  })),
}));

vi.mock('../src/jobs/index', () => ({
  JOBS: {
    'test-job': {
      schedule: '* * * * *',
      run: vi.fn(async () => ({ processed: 5, note: 'ok' })),
    },
  },
}));

vi.mock('../src/cron-lock', () => ({
  acquireCronLock: vi.fn(),
}));

vi.mock('../src/tenant-router', () => ({
  tenantRouter: {},
}));

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any stale state between tests
    vi.stubEnv('JOB_TIMEOUT_MS', '5000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exports a startScheduler function', async () => {
    const { startScheduler } = await import('../src/scheduler');
    expect(typeof startScheduler).toBe('function');
  });

  it('startScheduler returns a stop function', async () => {
    const { startScheduler } = await import('../src/scheduler');
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      with: vi.fn(() => log),
    };

    const stop = startScheduler(log);
    expect(typeof stop).toBe('function');
    stop(); // clean up
  });

  it('cleanupStaleCronRuns handles execution errors gracefully', async () => {
    // Force getDb to throw
    const ai = await import('@kestrel/ai');
    vi.mocked(ai.getDb).mockRejectedValueOnce(new Error('DB unavailable'));

    // Import and directly test cleanupStaleCronRuns
    const { startScheduler } = await import('../src/scheduler');
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      with: vi.fn(() => log),
    };

    // Should not throw
    const stop = startScheduler(log);
    expect(typeof stop).toBe('function');
    stop();
    // Cleanup failure should be logged as a warning
    expect(log.warn).toHaveBeenCalled();
  });
});
