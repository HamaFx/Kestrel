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

import { describe, expect, it } from 'vitest';

import { JOBS } from '../src/jobs';

describe('JOBS registry', () => {
  it('exposes the six core trader jobs plus optional embedding backfill', () => {
    expect(Object.keys(JOBS).sort()).toEqual([
      'alerts',
      'briefings',
      'cot',
      'embedding-backfill',
      'fred-actuals',
      'resonance-sync',
      'retention',
    ]);
    expect(JOBS['embedding-backfill']?.run).toBeTypeOf('function');
    expect(JOBS['embedding-backfill']?.description).toContain('Embed');
  });

  it('every registered job has both run + description', () => {
    for (const [name, def] of Object.entries(JOBS)) {
      expect(def.run, `${name} missing run`).toBeTypeOf('function');
      expect(typeof def.description, `${name} missing description`).toBe('string');
    }
  });

  it('keeps every registered job on the default budget', () => {
    // Minute-cadence jobs stay on the tight default so a wedge is detected fast.
    expect(JOBS.alerts?.timeoutMs).toBeUndefined();
    expect(JOBS.briefings?.timeoutMs).toBeUndefined();
  });

  it('wires a healthchecks.io UUID to every job (R16)', () => {
    // Every registered job must have an external health signal; a job without
    // one fails silently — the audit's R16 defect 4.
    for (const [name, def] of Object.entries(JOBS)) {
      expect(def.hcUuidEnvVar, `${name} missing hcUuidEnvVar`).toBeDefined();
      expect(def.hcUuidEnvVar).toMatch(/^HC_/);
    }
  });

  it('wires the core trader jobs to their documented env vars (R16)', () => {
    expect(JOBS.retention?.hcUuidEnvVar).toBe('HC_JOB_RETENTION_UUID');
    expect(JOBS.cot?.hcUuidEnvVar).toBe('HC_JOB_COT_UUID');
    expect(JOBS['fred-actuals']?.hcUuidEnvVar).toBe('HC_JOB_FRED_ACTUALS_UUID');
  });
});
