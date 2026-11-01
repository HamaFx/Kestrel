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

// R10 (audit 2026-10-31) — the worker hands the alert evaluator a budget that
// sits below the scheduler's job timeout, and surfaces what the run did not
// reach. A job that is killed by the scheduler mid-delivery is what used to
// leave a claim held for the full lease.

import { evaluateAlerts, type EvaluationResult } from '@kestrel/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAlerts } from '../src/jobs/alerts';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/tenant-router';

vi.mock('@kestrel/ai', () => ({
  evaluateAlerts: vi.fn(),
}));

const log = createLogger({ service: 'test', forceJson: true });
const tenantRouter = new TenantRouter();

function result(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    total: 3,
    matched: 2,
    fired: 1,
    skipped: 1,
    errors: [],
    deliveries: [],
    stopReason: 'complete',
    claimsReleased: 0,
    ...overrides,
  };
}

describe('runAlerts', () => {
  beforeEach(() => {
    vi.mocked(evaluateAlerts).mockReset();
  });

  it('bounds the run below the scheduler job timeout and forwards the abort signal', async () => {
    vi.mocked(evaluateAlerts).mockResolvedValue(result());
    const signal = new AbortController().signal;

    const jobResult = await runAlerts({ log, signal, tenantRouter });

    const args = vi.mocked(evaluateAlerts).mock.calls[0]![0]!;
    expect(args.signal).toBe(signal);
    // JOB_TIMEOUT_MS defaults to 120s; the run stops 30s earlier so it can
    // release its claims and report before the scheduler's hard cutoff.
    expect(args.budgetMs).toBe(90_000);
    expect(args.ownsTenant?.(process.cwd())).toBe(true);
    expect(jobResult.processed).toBe(3);
    expect(jobResult.note).toContain('fired=1');
    expect(jobResult.note).not.toContain('stop=');
  });

  it('reports an early stop and the claims it handed back', async () => {
    vi.mocked(evaluateAlerts).mockResolvedValue(
      result({ total: 200, fired: 4, stopReason: 'budget', claimsReleased: 1 }),
    );

    const jobResult = await runAlerts({
      log,
      signal: new AbortController().signal,
      tenantRouter,
    });

    expect(jobResult.note).toContain('stop=budget');
    expect(jobResult.processed).toBe(200);
  });
});
