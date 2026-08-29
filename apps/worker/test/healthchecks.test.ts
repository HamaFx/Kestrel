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

// Tests for the healthchecks.io client. We mock global fetch so no
// network IO happens.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ping, withHeartbeat } from '../src/healthchecks';

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response('OK')) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('ping', () => {
  it('is a no-op when uuid is empty / undefined', async () => {
    await ping('');
    await ping(undefined);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('GETs the bare UUID URL on a success ping', async () => {
    await ping('abc12345');
    const url = String(
      (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    );
    expect(url).toBe('https://hc-ping.com/abc12345');
  });

  it('appends /fail or /start to the URL for non-success statuses', async () => {
    await ping('abc12345', 'fail');
    await ping('abc12345', 'start');
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]?.[0])).toBe('https://hc-ping.com/abc12345/fail');
    expect(String(calls[1]?.[0])).toBe('https://hc-ping.com/abc12345/start');
  });

  it('POSTs when a body is provided', async () => {
    await ping('abc12345', 'success', 'duration=42ms');
    const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      RequestInit | undefined;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('duration=42ms');
  });

  it('swallows fetch failures (heartbeat never throws)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    let captured: unknown = null;
    await ping('abc12345', 'success', undefined, (e) => {
      captured = e;
    });
    expect(captured).toBeInstanceOf(Error);
  });
});

describe('withHeartbeat', () => {
  it('emits start + success on a successful run', async () => {
    const result = await withHeartbeat('abc12345', async () => 42);
    expect(result).toBe(42);

    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]?.[0])).toBe('https://hc-ping.com/abc12345/start');
    expect(String(calls[1]?.[0])).toBe('https://hc-ping.com/abc12345');
  });

  it('emits start + fail on an error and re-throws', async () => {
    const fn = (): Promise<number> => Promise.reject(new Error('boom'));

    await expect(withHeartbeat('abc12345', fn)).rejects.toThrow('boom');

    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]?.[0])).toBe('https://hc-ping.com/abc12345/start');
    expect(String(calls[1]?.[0])).toBe('https://hc-ping.com/abc12345/fail');
    const failInit = calls[1]?.[1] as RequestInit | undefined;
    expect(failInit?.body).toBe('boom');
  });

  it('skips network IO entirely when uuid is undefined', async () => {
    const result = await withHeartbeat(undefined, async () => 'ok');
    expect(result).toBe('ok');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
