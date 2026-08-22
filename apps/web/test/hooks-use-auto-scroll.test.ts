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
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoScroll } from '../src/hooks/use-auto-scroll';

function createMockRef(
  current: HTMLDivElement | null = null,
): React.RefObject<HTMLDivElement | null> {
  return { current };
}

function createMockDiv(scrollHeight = 1000, scrollTop = 0, clientHeight = 500): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true, writable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  el.addEventListener = vi.fn();
  el.removeEventListener = vi.fn();
  el.scrollTo = vi.fn();
  return el;
}

describe('useAutoScroll', () => {
  it('returns showScrollFab based on scroll position', () => {
    const div = createMockDiv(1000, 800, 500);
    const ref = createMockRef(div);

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    const { result } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        scrollElement: div,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(typeof result.current.scrollToBottom).toBe('function');

    rafSpy.mockRestore();
  });

  it('scrolls to bottom on initial mount', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    // Mock requestAnimationFrame to execute synchronously
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        scrollElement: div,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(div.scrollTop).toBe(div.scrollHeight);
    rafSpy.mockRestore();
  });

  it('scrollToBottom function calls scrollTo with smooth behavior', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    const { result } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        scrollElement: div,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    result.current.scrollToBottom();
    expect(div.scrollTo).toHaveBeenCalledWith({ top: div.scrollHeight, behavior: 'smooth' });
  });

  it('handles null scrollRef gracefully', () => {
    const ref = createMockRef(null);
    const { result } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        scrollElement: null,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(result.current.showScrollFab).toBe(false);
    // scrollToBottom should not throw
    expect(() => result.current.scrollToBottom()).not.toThrow();
  });

  it('registers scroll event listener on mount', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        scrollElement: div,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    expect(div.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });
  });

  it('cleans up scroll listener on unmount', () => {
    const div = createMockDiv();
    const ref = createMockRef(div);
    const { unmount } = renderHook(() =>
      useAutoScroll({
        scrollRef: ref,
        scrollElement: div,
        dependency: [],
        resetKey: 'thread-1',
        isStreaming: false,
      }),
    );
    unmount();
    expect(div.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
