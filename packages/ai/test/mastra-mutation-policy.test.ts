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

import { afterEach, describe, expect, it } from 'vitest';

import { assertMastraMutationAllowed, evaluateMastraMutation } from '../src/mastra';

afterEach(() => {
  delete process.env.ENABLE_MASTRA_MUTATIONS;
});

describe('Mastra mutation policy', () => {
  const request = {
    mutation: 'set_alert' as const,
    userId: 'user-1',
    threadId: 'thread-1',
    confirmed: true,
  };

  it('rejects mutations while the operator flag is absent', () => {
    expect(evaluateMastraMutation(request)).toEqual({
      allowed: false,
      mutation: 'set_alert',
      reason: 'disabled',
    });
    expect(() => assertMastraMutationAllowed(request)).toThrow('disabled by policy');
  });

  it('requires server-side confirmation after enablement', () => {
    process.env.ENABLE_MASTRA_MUTATIONS = 'true';
    expect(evaluateMastraMutation({ ...request, confirmed: false })).toMatchObject({
      allowed: false,
      reason: 'confirmation-required',
    });
  });

  it('allows only a valid confirmed request when explicitly enabled', () => {
    process.env.ENABLE_MASTRA_MUTATIONS = 'true';
    expect(evaluateMastraMutation(request)).toEqual({
      allowed: true,
      mutation: 'set_alert',
    });
  });
});
