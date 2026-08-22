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

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock the structured logger used by wait-until's shim fallback
const mockWarn = vi.fn();
vi.mock('@kestrel/shared/logger', () => ({
  createCategorizedLogger: () => ({ warn: mockWarn }),
}));

describe('waitUntil', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockWarn.mockReset();
  });

  it('does not throw when called with a resolved promise', async () => {
    const mod = await import('../src/wait-until');
    let resolved = false;
    const promise = new Promise<void>((resolve) => {
      mod.waitUntil(Promise.resolve('ok'));
      resolved = true;
      resolve();
    });
    await promise;
    expect(resolved).toBe(true);
  });

  it('handles a rejected promise via the shim catch handler', async () => {
    const mod = await import('../src/wait-until');
    const err = new Error('test error');
    const promise = new Promise((_, reject) => {
      // Delay long enough for the shim catch to be installed after
      // resolveWaitUntil resolves the dynamic import.
      setTimeout(() => reject(err), 100);
    });
    mod.waitUntil(promise);
    await new Promise((r) => setTimeout(r, 200));
    expect(mockWarn).toHaveBeenCalledWith('background promise rejected', { err: String(err) });
  });

  it('accepts multiple sequential calls', async () => {
    const mod = await import('../src/wait-until');
    const results: string[] = [];
    const p1 = new Promise<string>((resolve) =>
      setTimeout(() => {
        results.push('a');
        resolve('a');
      }, 20),
    );
    const p2 = new Promise<string>((resolve) =>
      setTimeout(() => {
        results.push('b');
        resolve('b');
      }, 40),
    );
    expect(() => {
      mod.waitUntil(p1);
      mod.waitUntil(p2);
    }).not.toThrow();
    await new Promise((r) => setTimeout(r, 80));
    expect(results).toEqual(['a', 'b']);
  });

  it('handles concurrent calls before the binding is resolved', async () => {
    const mod = await import('../src/wait-until');
    const results: string[] = [];
    const p1 = new Promise<string>((resolve) =>
      setTimeout(() => {
        results.push('a');
        resolve('a');
      }, 20),
    );
    const p2 = new Promise<string>((resolve) =>
      setTimeout(() => {
        results.push('b');
        resolve('b');
      }, 20),
    );
    expect(() => {
      mod.waitUntil(p1);
      mod.waitUntil(p2);
    }).not.toThrow();
    await new Promise((r) => setTimeout(r, 80));
    expect(results).toEqual(['a', 'b']);
  });

  it('uses the shim fallback when @vercel/functions is not available', async () => {
    const mod = await import('../src/wait-until');
    const err = new Error('shim fallback');
    const promise = new Promise((_, reject) => {
      setTimeout(() => reject(err), 100);
    });
    mod.waitUntil(promise);
    await new Promise((r) => setTimeout(r, 200));
    expect(mockWarn).toHaveBeenCalledWith('background promise rejected', { err: String(err) });
  });
});
