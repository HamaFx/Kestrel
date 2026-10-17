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

import { redactSecrets, redactString } from '../src/diagnostics/redact';

describe('redactSecrets — string patterns', () => {
  it.each([
    [
      'Authorization headers with Bearer',
      'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test',
      'authorization=<redacted>',
    ],
    [
      'Authorization headers with Basic',
      'Authorization: Basic dXNlcjpwYXNz',
      'authorization=<redacted>',
    ],
    ['authorization=Token patterns', 'authorization=Token abc123xyz', 'authorization=<redacted>'],
    [
      'URLs with embedded credentials',
      'https://user:secretpass@api.example.com/data',
      'https://<redacted>:<redacted>@api.example.com/data',
    ],
    [
      'URLs with token query params',
      'https://api.example.com/data?token=secret123&foo=bar',
      '<redacted-url>',
    ],
    ['URLs with key query params', 'https://api.example.com/webhook?key=abc456', '<redacted-url>'],
    [
      'JSON-style key: "value" patterns',
      '"api_key": "sk-1234567890abcdef"',
      '"api_key": "<redacted>"',
    ],
    [
      'single-quote JSON-style patterns',
      "'access_token': 'abc123secret'",
      "'access_token': '<redacted>'",
    ],
    ['key=value patterns', 'api_key=sk-1234567890abcdef', 'api_key=<redacted>'],
    ['password=value patterns', 'password=mySecretPass123', 'password=<redacted>'],
    [
      'Bearer tokens in text',
      'Using Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIx',
      'Using Bearer <redacted>',
    ],
    ['x-api-key headers', 'x-api-key: my-secret-api-key-123', 'x-api-key=<redacted>'],
    [
      'non-sensitive strings',
      'The price of XAUUSD is 2345.60 as of 2026-06-27 14:00 UTC',
      'The price of XAUUSD is 2345.60 as of 2026-06-27 14:00 UTC',
    ],
    [
      'multiple secrets in one string',
      'api_key=sk-abc123 token=xyz456 password=secret789',
      'api_key=<redacted> token=<redacted> password=<redacted>',
    ],
  ] as const)('redacts %s', (_label, input, expected) => {
    expect(redactString(input)).toBe(expected);
  });
});

describe('redactSecrets — object patterns', () => {
  it('redacts sensitive keys in objects', () => {
    const input = {
      api_key: 'sk-123456',
      symbol: 'XAUUSD',
      price: 2345.6,
    };
    const out = redactSecrets(input) as Record<string, unknown>;
    expect(out.api_key).toBe('<redacted>');
    expect(out.symbol).toBe('XAUUSD');
    expect(out.price).toBe(2345.6);
  });

  it('redacts nested sensitive keys', () => {
    const input = {
      config: {
        token: 'abc123',
        endpoint: 'https://api.example.com',
      },
      data: 'normal',
    };
    const out = redactSecrets(input) as Record<string, unknown>;
    const config = out.config as Record<string, unknown>;
    expect(config.token).toBe('<redacted>');
    expect(config.endpoint).toBe('https://api.example.com');
    expect(out.data).toBe('normal');
  });

  it('redacts sensitive keys in arrays of objects', () => {
    const input = [
      { name: 'user1', password: 'pass123' },
      { name: 'user2', secret: 'secret456' },
    ];
    const out = redactSecrets(input) as Array<Record<string, unknown>>;
    expect(out[0]!.password).toBe('<redacted>');
    expect(out[0]!.name).toBe('user1');
    expect(out[1]!.secret).toBe('<redacted>');
    expect(out[1]!.name).toBe('user2');
  });

  it('redacts various sensitive key name patterns', () => {
    const input = {
      apiKey: 'abc',
      access_token: 'def',
      AUTH_TOKEN: 'ghi',
      cookie: 'jkl',
      webhook: 'mno',
      privateKey: 'pqr',
      clientSecret: 'stu',
      refreshToken: 'vwx',
    };
    const out = redactSecrets(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(out[key]).toBe('<redacted>');
    }
  });

  it('also redacts secrets in string values within objects', () => {
    const input = {
      header: 'authorization: Bearer my-secret-token',
      data: 'normal text',
    };
    const out = redactSecrets(input) as Record<string, unknown>;
    expect(out.header).toBe('authorization=<redacted>');
    expect(out.data).toBe('normal text');
  });

  it('handles null and undefined', () => {
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets(undefined)).toBe(undefined);
  });

  it('handles numbers and booleans', () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(true)).toBe(true);
    expect(redactSecrets(false)).toBe(false);
  });

  it('handles empty objects and arrays', () => {
    expect(redactSecrets({})).toEqual({});
    expect(redactSecrets([])).toEqual([]);
  });

  it('handles deeply nested structures', () => {
    const input = {
      level1: {
        level2: {
          level3: {
            api_key: 'deep-secret',
            data: 'visible',
          },
        },
      },
    };
    const out = redactSecrets(input) as Record<string, unknown>;
    const l1 = out.level1 as Record<string, unknown>;
    const l2 = l1.level2 as Record<string, unknown>;
    const l3 = l2.level3 as Record<string, unknown>;
    expect(l3.api_key).toBe('<redacted>');
    expect(l3.data).toBe('visible');
  });
});
