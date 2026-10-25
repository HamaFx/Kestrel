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

import { beforeEach, describe, expect, it } from 'vitest';

import { createWebhookToken, generateStartToken, verifyTelegramToken } from '../src/bot/link';
import { secretMatches } from '../src/server/secret';

describe('Telegram tokens', () => {
  beforeEach(() => {
    process.env.TELEGRAM_PLUGIN_SECRET = 'test-secret-that-is-long-enough';
  });

  it('creates and verifies a webhook token', () => {
    const token = createWebhookToken('user-123');
    expect(verifyTelegramToken(token)).toMatchObject({ userId: 'user-123' });
  });

  it('rejects malformed or tampered tokens', () => {
    const token = createWebhookToken('user-123');
    const tampered = `${token.slice(0, -2)}xx`;
    expect(verifyTelegramToken(tampered)).toBeNull();
    expect(verifyTelegramToken('not-a-token')).toBeNull();
  });

  it('generates start tokens that fit Telegram’s 64-character payload limit', () => {
    const token = generateStartToken();
    expect(token).toMatch(/^v1_[A-Za-z0-9_-]{24}$/);
    expect(token.length).toBeLessThanOrEqual(64);
  });

  it('compares Telegram secret headers in constant time', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abc', 'abd')).toBe(false);
    expect(secretMatches(null, 'abc')).toBe(false);
  });
});
