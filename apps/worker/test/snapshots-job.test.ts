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

// The `snapshots` job delegates to the shared `runSnapshotRefresh` runner
// (also used by the `/api/cron/snapshots` fallback), so the scheduled and
// manual paths share symbol coverage and the candles_1m prune.

// eslint-disable-next-line no-restricted-imports -- Tests mock the public AI barrel to preserve job wiring coverage.
import * as cron from '@kestrel/ai/cron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSnapshots } from '../src/jobs/snapshots';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/runtime/tenant-router';

vi.mock('@kestrel/ai/cron', () => ({
  runSnapshotRefresh: vi.fn(),
}));

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(cron.runSnapshotRefresh).mockReset();
});

describe('runSnapshots', () => {
  it('delegates to the shared runner with the job signal and logger', async () => {
    const signal = new AbortController().signal;
    vi.mocked(cron.runSnapshotRefresh).mockResolvedValue({
      processed: 18,
      errors: [],
      pruned: 7,
      candles1mTotal: 120,
      note: 'symbols=18/18 errors=0 pruned=7 candles_1m_total=120',
    });

    const result = await runSnapshots({ log, signal, tenantRouter: testRouter });

    expect(cron.runSnapshotRefresh).toHaveBeenCalledWith({ signal, log });
    expect(result).toEqual({
      processed: 18,
      note: 'symbols=18/18 errors=0 pruned=7 candles_1m_total=120',
    });
  });
});
