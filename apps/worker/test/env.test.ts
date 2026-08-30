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

// Tests for the worker env loader. Pure-zod, no IO.

import { describe, expect, it } from 'vitest';

import { loadEnv, resolveDatabaseUrl } from '../src/env';

const VALID = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/db',
  NODE_ENV: 'test' as const,
};

describe('loadEnv', () => {
  it('accepts the minimal happy path', () => {
    const env = loadEnv(VALID as unknown as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL);
    expect(env.BIQUOTE_HUB_URL).toBe('https://biquote.io/hubs/tick');
    expect(env.DEPLOYED_SHA).toBe('unknown');
    expect(env.NODE_ENV).toBe('test');
    expect(env.WORKER_HTTP_PORT).toBe(8081);
    expect(env.WORKER_PROXY_PORT).toBe(8082);
    expect(env.WORKER_HTTP_HOST).toBeUndefined();
  });

  it('accepts POSTGRES_URL as an alternative to DATABASE_URL', () => {
    const env = loadEnv({
      POSTGRES_URL: 'postgres://user:pw@localhost:5432/db',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.POSTGRES_URL).toBe('postgres://user:pw@localhost:5432/db');
  });

  it('throws when neither database URL nor production worker tokens are set', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /WORKER_HEALTH_TOKEN|BIQUOTE_PROXY_TOKEN|DATABASE_URL or POSTGRES_URL/,
    );
  });

  it('requires health and proxy tokens in production', () => {
    const base = {
      DATABASE_URL: VALID.DATABASE_URL,
      NODE_ENV: 'production',
    } as unknown as NodeJS.ProcessEnv;

    expect(() => loadEnv(base)).toThrow(/WORKER_HEALTH_TOKEN/);
    expect(() =>
      loadEnv({ ...base, WORKER_HEALTH_TOKEN: 'health-token' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/BIQUOTE_PROXY_TOKEN/);
    expect(
      loadEnv({
        ...base,
        WORKER_HEALTH_TOKEN: 'health-token',
        BIQUOTE_PROXY_TOKEN: 'proxy-token',
      } as unknown as NodeJS.ProcessEnv).BIQUOTE_PROXY_TOKEN,
    ).toBe('proxy-token');
  });

  it('allows missing DATABASE_URL in development (PGlite mode)', () => {
    const env = loadEnv({ NODE_ENV: 'development' } as unknown as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.POSTGRES_URL).toBeUndefined();
    expect(env.NODE_ENV).toBe('development');
  });

  it('validates the worker HTTP port', () => {
    expect(() =>
      loadEnv({ ...VALID, WORKER_HTTP_PORT: '70000' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Invalid worker environment/);
  });

  it('accepts a private worker HTTP host override', () => {
    const env = loadEnv({ ...VALID, WORKER_HTTP_HOST: '127.0.0.1', WORKER_HTTP_PORT: '9090' } as unknown as NodeJS.ProcessEnv);
    expect(env.WORKER_HTTP_HOST).toBe('127.0.0.1');
    expect(env.WORKER_HTTP_PORT).toBe(9090);
  });

  it('rejects malformed URLs', () => {
    expect(() => loadEnv({ DATABASE_URL: 'not-a-url' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /Invalid worker environment/,
    );
  });

  it('honors BIQUOTE_HUB_URL override when set', () => {
    const env = loadEnv({
      ...VALID,
      BIQUOTE_HUB_URL: 'https://biquote.example/hubs/tick',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.BIQUOTE_HUB_URL).toBe('https://biquote.example/hubs/tick');
  });

  it('makes healthcheck UUIDs optional (no-op in dev)', () => {
    const env = loadEnv(VALID as unknown as NodeJS.ProcessEnv);
    expect(env.HC_SIGNALR_UUID).toBeUndefined();
    expect(env.HC_BACKUP_DB_UUID).toBeUndefined();
  });

  it('treats empty HC UUIDs as undefined (operator can leave the row blank)', () => {
    const env = loadEnv({
      ...VALID,
      HC_SIGNALR_UUID: '',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.HC_SIGNALR_UUID).toBeUndefined();
  });
});

describe('resolveDatabaseUrl', () => {
  it('prefers DATABASE_URL over POSTGRES_URL', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://primary',
      POSTGRES_URL: 'postgres://secondary',
    } as unknown as NodeJS.ProcessEnv);
    expect(resolveDatabaseUrl(env)).toBe('postgres://primary');
  });

  it('falls through to POSTGRES_URL when DATABASE_URL is unset', () => {
    const env = loadEnv({
      POSTGRES_URL: 'postgres://only',
    } as unknown as NodeJS.ProcessEnv);
    expect(resolveDatabaseUrl(env)).toBe('postgres://only');
  });
});
