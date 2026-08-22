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

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCopied } from '../src/hooks/use-copied';

describe('useCopied', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false initially', () => {
    const { result } = renderHook(() => useCopied());
    expect(result.current[0]).toBe(false);
    expect(typeof result.current[1]).toBe('function');
  });

  it('sets copied to true when trigger is called', () => {
    const { result } = renderHook(() => useCopied());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });

  it('resets copied to false after the default timeout', () => {
    const { result } = renderHook(() => useCopied(1500));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current[0]).toBe(false);
  });

  it('resets copied to false after a custom timeout', () => {
    const { result } = renderHook(() => useCopied(3000));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => vi.advanceTimersByTime(2999));
    expect(result.current[0]).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe(false);
  });

  it('re-triggering resets the previous timeout', () => {
    const { result } = renderHook(() => useCopied(2000));
    act(() => result.current[1]());
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current[1]());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current[0]).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current[0]).toBe(false);
  });

  it('clears the timeout on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    const { result, unmount } = renderHook(() => useCopied());
    act(() => result.current[1]());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
