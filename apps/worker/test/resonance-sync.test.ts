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

// The worker job is a thin cron wrapper: the correlation/regression logic and
// its R8 honesty guards live in `@kestrel/ai` and are covered there. This test
// pins the delegation contract (processed count + note) and the signal pass-through.

import { syncIntermarketResonance } from '@kestrel/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runResonanceSync } from '../src/jobs/resonance-sync';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/runtime/tenant-router';

vi.mock('@kestrel/ai', () => ({
  syncIntermarketResonance: vi.fn(),
}));

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(syncIntermarketResonance).mockReset();
});

describe('runResonanceSync', () => {
  it('returns the service processed count and note', async () => {
    vi.mocked(syncIntermarketResonance).mockResolvedValue({
      status: 'synced',
      processed: 6,
      aligned: 6,
      divergencesDefined: true,
      note: 'synchronized=6 observations',
    });

    const result = await runResonanceSync({
      log,
      signal: new AbortController().signal,
      tenantRouter: testRouter,
    });

    expect(result).toEqual({ processed: 6, note: 'synchronized=6 observations' });
  });

  it('forwards the job AbortSignal to the shared service', async () => {
    vi.mocked(syncIntermarketResonance).mockResolvedValue({
      status: 'aborted',
      processed: 0,
      aligned: 6,
      divergencesDefined: true,
      note: 'aborted before persistence',
    });
    const controller = new AbortController();

    const result = await runResonanceSync({
      log,
      signal: controller.signal,
      tenantRouter: testRouter,
    });

    expect(syncIntermarketResonance).toHaveBeenCalledWith({ signal: controller.signal });
    expect(result).toEqual({ processed: 0, note: 'aborted before persistence' });
  });
});
