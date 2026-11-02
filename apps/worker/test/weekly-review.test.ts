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

// The `weekly-review` job delegates to the shared `runWeeklyReviewFanout`
// runner (also used by the `/api/cron/weekly-review` fallback); the worker
// supplies only its tenant-partition filter and SIGTERM signal.

import * as cron from '@kestrel/ai/cron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runWeeklyReview } from '../src/jobs/weekly-review';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/runtime/tenant-router';

vi.mock('@kestrel/ai/cron', () => ({
  runWeeklyReviewFanout: vi.fn(),
}));

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(cron.runWeeklyReviewFanout).mockReset();
});

describe('runWeeklyReview', () => {
  it('delegates to the shared runner and reports the emitted count', async () => {
    const signal = new AbortController().signal;
    vi.mocked(cron.runWeeklyReviewFanout).mockResolvedValue({ processed: 1, reasons: [] });

    const result = await runWeeklyReview({ log, signal, tenantRouter: testRouter });

    expect(cron.runWeeklyReviewFanout).toHaveBeenCalledWith({
      signal,
      log,
      filterUserIds: expect.any(Function),
    });
    expect(result).toEqual({ processed: 1 });
  });

  it('returns processed=0 without surfacing per-user reasons in the job result', async () => {
    vi.mocked(cron.runWeeklyReviewFanout).mockResolvedValue({
      processed: 0,
      reasons: ['[u1]: already-emitted'],
    });

    const result = await runWeeklyReview({
      log,
      signal: new AbortController().signal,
      tenantRouter: testRouter,
    });

    expect(result).toEqual({ processed: 0 });
  });
});
