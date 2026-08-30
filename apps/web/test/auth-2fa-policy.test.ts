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

// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const authSource = readFileSync(resolve(root, 'apps/web/src/lib/auth/credentials-authorize.ts'), 'utf8');
const actionsSource = readFileSync(resolve(root, 'apps/web/src/app/(auth)/actions.ts'), 'utf8');

describe('2FA rate-limit security policy', () => {
  it('fails closed when the database-backed limiter is unavailable', () => {
    const rateLimitBlockStart = authSource.indexOf("withRateLimit(user.id, '2fa_verify', 10)");
    const rateLimitBlockEnd = authSource.indexOf('const secret =', rateLimitBlockStart);

    expect(rateLimitBlockStart).toBeGreaterThan(-1);
    expect(rateLimitBlockEnd).toBeGreaterThan(rateLimitBlockStart);

    const rateLimitBlock = authSource.slice(rateLimitBlockStart, rateLimitBlockEnd);
    expect(rateLimitBlock).toContain("throw new AuthError('2FA_SYSTEM_ERROR')");
    expect(authSource).toContain('auth/2fa_rate_limit_unavailable');
    expect(rateLimitBlock).not.toContain('fail open');
  });

  it('keeps backend failure distinct from an exceeded 2FA limit', () => {
    expect(authSource).toContain("throw new AuthError('2FA_RATE_LIMITED')");
    expect(actionsSource).toContain("message === '2FA_RATE_LIMITED'");
    expect(actionsSource).toContain("message === '2FA_SYSTEM_ERROR'");
    expect(actionsSource).toContain('Unable to verify 2FA right now. Please try again.');
    expect(actionsSource).toContain('requires2FA: true');
  });
});
