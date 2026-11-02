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

// The `fred-actuals` job delegates to the shared `runFredActualsRefresh`
// runner (also used by the `/api/cron/fred-actuals` fallback), so this suite
// pins the job wiring, including the FRED key pass-through.

// eslint-disable-next-line no-restricted-imports -- Tests mock the public AI barrel to preserve job wiring coverage.
import * as cron from '@kestrel/ai/cron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runFredActuals } from '../src/jobs/fred-actuals';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/runtime/tenant-router';

vi.mock('@kestrel/ai/cron', () => ({
  runFredActualsRefresh: vi.fn(),
}));

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();
const ORIGINAL_FRED_KEY = process.env['FRED_API_KEY'];

beforeEach(() => {
  vi.mocked(cron.runFredActualsRefresh).mockReset();
});

afterEach(() => {
  if (ORIGINAL_FRED_KEY === undefined) delete process.env['FRED_API_KEY'];
  else process.env['FRED_API_KEY'] = ORIGINAL_FRED_KEY;
});

describe('runFredActuals', () => {
  it('passes the configured FRED key, signal, and logger to the shared runner', async () => {
    process.env['FRED_API_KEY'] = 'test-key';
    const signal = new AbortController().signal;
    vi.mocked(cron.runFredActualsRefresh).mockResolvedValue({
      processed: 2,
      biquoteUpserted: 0,
      candidates: 2,
      filled: 2,
      skipped: 0,
      errors: [],
      note: 'filled=2, skipped=0, errors=0',
    });

    const result = await runFredActuals({ log, signal, tenantRouter: testRouter });

    expect(cron.runFredActualsRefresh).toHaveBeenCalledWith({
      fredApiKey: 'test-key',
      signal,
      log,
    });
    expect(result).toEqual({ processed: 2, note: 'filled=2, skipped=0, errors=0' });
  });

  it('passes null when FRED_API_KEY is missing so the runner only does the BiQuote step', async () => {
    delete process.env['FRED_API_KEY'];
    vi.mocked(cron.runFredActualsRefresh).mockResolvedValue({
      processed: 0,
      biquoteUpserted: 0,
      candidates: 0,
      filled: 0,
      skipped: 0,
      errors: [],
      note: 'FRED_API_KEY missing',
    });

    const result = await runFredActuals({
      log,
      signal: new AbortController().signal,
      tenantRouter: testRouter,
    });

    expect(cron.runFredActualsRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ fredApiKey: null }),
    );
    expect(result.note).toBe('FRED_API_KEY missing');
  });
});
