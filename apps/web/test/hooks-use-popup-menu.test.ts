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

import { usePopupMenu } from '../src/hooks/use-popup-menu';

describe('usePopupMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns closed state initially', () => {
    const { result } = renderHook(() => usePopupMenu());
    expect(result.current.open).toBe(false);
    expect(result.current.menuRef).toBeDefined();
    expect(result.current.triggerRef).toBeDefined();
  });

  it('setOpen toggles the open state', () => {
    const { result } = renderHook(() => usePopupMenu());
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });

  it('close sets open to false', () => {
    const { result } = renderHook(() => usePopupMenu());
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it('toggle flips the open state', () => {
    const { result } = renderHook(() => usePopupMenu());
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it('registers and cleans up event listeners when open', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { result, unmount } = renderHook(() => usePopupMenu());

    act(() => result.current.setOpen(true));
    expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('closes when Escape key is pressed', () => {
    const { result } = renderHook(() => usePopupMenu());
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.open).toBe(false);
  });

  it('does not register listeners when closed', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { result } = renderHook(() => usePopupMenu());

    // Should not register when closed (initial state)
    expect(addSpy).not.toHaveBeenCalledWith('pointerdown', expect.any(Function));

    act(() => result.current.setOpen(true));
    // Should register when opened
    const pointerCalls = addSpy.mock.calls.filter(([event]) => event === 'pointerdown');
    expect(pointerCalls.length).toBeGreaterThan(0);

    addSpy.mockRestore();
  });

  it('focusFirstOnOpen=false does not query menuitems', () => {
    const { result } = renderHook(() => usePopupMenu({ focusFirstOnOpen: false }));
    act(() => result.current.setOpen(true));
    // Should not throw — simply doesn't attempt to focus
    expect(result.current.open).toBe(true);
  });
});
