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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertMastraMutationAllowed,
  evaluateMastraMutation,
  issueMutationConfirmationToken,
  storedConfirmationForToken,
} from '../src/mastra';

const SECRET = 'm'.repeat(64);
const INPUT_DIGEST = 'a'.repeat(64);

beforeEach(() => {
  process.env.AUTH_COOKIE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.ENABLE_MASTRA_MUTATIONS;
  delete process.env.AUTH_COOKIE_SECRET;
});

function makeRequest() {
  const issued = issueMutationConfirmationToken({
    mutation: 'set_alert',
    userId: 'user-1',
    secret: SECRET,
    ttlMs: 60_000,
  });
  const confirmation = storedConfirmationForToken(issued.token, {
    mutation: 'set_alert',
    userId: 'user-1',
    inputDigest: INPUT_DIGEST,
    expiresAt: issued.expiresAt,
    secret: SECRET,
  });
  return {
    mutation: 'set_alert' as const,
    userId: 'user-1',
    threadId: 'thread-1',
    approval: {
      approvalId: 'approval-1',
      userId: 'user-1',
      threadId: 'thread-1',
      mutation: 'set_alert' as const,
      inputDigest: INPUT_DIGEST,
      expiresAt: issued.expiresAt,
      confirmationToken: issued.token,
      confirmation,
    },
  };
}

describe('Mastra mutation policy', () => {
  it('rejects mutations while the operator flag is absent', () => {
    const request = makeRequest();
    expect(evaluateMastraMutation(request)).toEqual({
      allowed: false,
      mutation: 'set_alert',
      reason: 'disabled',
    });
    expect(() => assertMastraMutationAllowed(request)).toThrow('disabled by policy');
  });

  it('rejects an unverified or forged confirmation proof after enablement', () => {
    process.env.ENABLE_MASTRA_MUTATIONS = 'true';
    const request = makeRequest();
    expect(
      evaluateMastraMutation({
        ...request,
        approval: { ...request.approval, confirmationToken: 'attacker-token' },
      }),
    ).toMatchObject({
      allowed: false,
      reason: 'token-invalid',
    });
  });

  it('allows only a valid token proof when explicitly enabled', () => {
    process.env.ENABLE_MASTRA_MUTATIONS = 'true';
    const request = makeRequest();
    expect(evaluateMastraMutation(request)).toEqual({
      allowed: true,
      mutation: 'set_alert',
    });
  });
});
