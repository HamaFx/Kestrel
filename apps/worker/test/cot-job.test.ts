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

// The `cot` job delegates to the shared `runCotIngestion` runner (also used by
// the `/api/cron/cot` fallback), so this suite pins the job wiring only.

import * as cron from '@kestrel/ai/cron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runCoT } from '../src/jobs/cot';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/runtime/tenant-router';

vi.mock('@kestrel/ai/cron', () => ({
  runCotIngestion: vi.fn(),
}));

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(cron.runCotIngestion).mockReset();
});

describe('runCoT', () => {
  it('delegates to the shared runner with the job signal and logger', async () => {
    const signal = new AbortController().signal;
    vi.mocked(cron.runCotIngestion).mockResolvedValue({
      processed: 3,
      upserted: 6,
      errors: [],
      note: 'upserted=6 errors=0',
    });

    const result = await runCoT({ log, signal, tenantRouter: testRouter });

    expect(cron.runCotIngestion).toHaveBeenCalledWith({ signal, log });
    expect(result).toEqual({ processed: 3, note: 'upserted=6 errors=0' });
  });

  it('surfaces the runner counts unchanged in the healthcheck note', async () => {
    vi.mocked(cron.runCotIngestion).mockResolvedValue({
      processed: 2,
      upserted: 4,
      errors: [{ symbol: 'XAUUSD', message: 'cftc down' }],
      note: 'upserted=4 errors=1',
    });

    const result = await runCoT({
      log,
      signal: new AbortController().signal,
      tenantRouter: testRouter,
    });

    expect(result.note).toMatch(/errors=1/);
  });
});
