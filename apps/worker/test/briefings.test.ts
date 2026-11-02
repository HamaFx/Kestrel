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

// The `briefings` job delegates to the shared `runBriefingsFanout` runner
// (also used by the `/api/cron/briefings` fallback); the worker supplies only
// its tenant-partition filter and SIGTERM signal.

import * as cron from '@kestrel/ai/cron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runBriefings } from '../src/jobs/briefings';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/runtime/tenant-router';

vi.mock('@kestrel/ai/cron', () => ({
  runBriefingsFanout: vi.fn(),
}));

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(cron.runBriefingsFanout).mockReset();
});

describe('runBriefings', () => {
  it('delegates to the shared runner with the signal, logger, and partition filter', async () => {
    const signal = new AbortController().signal;
    vi.mocked(cron.runBriefingsFanout).mockResolvedValue({
      processed: 3,
      preCandidates: 2,
      preEmitted: 2,
      postCandidates: 1,
      postEmitted: 1,
      note: 'pre=2/2, post=1/1',
    });

    const result = await runBriefings({ log, signal, tenantRouter: testRouter });

    expect(cron.runBriefingsFanout).toHaveBeenCalledWith({
      signal,
      log,
      filterUserIds: expect.any(Function),
    });
    expect(result).toEqual({ processed: 3, note: 'pre=2/2, post=1/1' });
  });

  it('filters discovery to users owned by this worker partition', async () => {
    vi.mocked(cron.runBriefingsFanout).mockResolvedValue({
      processed: 0,
      preCandidates: 0,
      preEmitted: 0,
      postCandidates: 0,
      postEmitted: 0,
      note: 'no owned active users',
    });

    await runBriefings({ log, signal: new AbortController().signal, tenantRouter: testRouter });

    const options = vi.mocked(cron.runBriefingsFanout).mock.calls[0]?.[0];
    expect(options?.filterUserIds?.(['u1', 'u2'])).toEqual(['u1', 'u2']);
  });
});
