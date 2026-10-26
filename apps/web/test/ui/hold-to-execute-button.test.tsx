// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

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

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HoldToExecuteButton } from '@/components/ui/hold-to-execute-button';

describe('HoldToExecuteButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', {
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    cleanup();
  });

  it('renders with default label and accessible button role', () => {
    const onExecute = vi.fn();
    render(<HoldToExecuteButton onExecute={onExecute} />);
    const btn = screen.getByRole('button', { name: /hold to execute/i });
    expect(btn).toBeTruthy();
  });

  it('renders custom label and size classes', () => {
    const onExecute = vi.fn();
    render(
      <HoldToExecuteButton
        onExecute={onExecute}
        label="Hold to Confirm Trade"
        size="lg"
        variant="bull"
      />,
    );
    const btn = screen.getByRole('button', { name: /hold to confirm trade/i });
    expect(btn).toBeTruthy();
    expect(btn.className).toContain('h-12');
  });

  it('does not trigger onExecute if pointer is released prematurely', () => {
    const onExecute = vi.fn();
    render(
      <HoldToExecuteButton onExecute={onExecute} holdDurationMs={1000} label="Execute Order" />,
    );
    const btn = screen.getByRole('button', { name: /execute order/i });

    // Press down
    fireEvent.pointerDown(btn);
    // Release early
    fireEvent.pointerUp(btn);

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(onExecute).not.toHaveBeenCalled();
  });

  it('does not trigger when disabled', () => {
    const onExecute = vi.fn();
    render(<HoldToExecuteButton onExecute={onExecute} disabled={true} label="Execute Order" />);
    const btn = screen.getByRole('button', { name: /execute order/i });
    expect(btn).toBeDisabled();

    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onExecute).not.toHaveBeenCalled();
  });

  it('cancels hold on pointerLeave or pointerCancel', () => {
    const onExecute = vi.fn();
    render(
      <HoldToExecuteButton onExecute={onExecute} holdDurationMs={1000} label="Execute Order" />,
    );
    const btn = screen.getByRole('button', { name: /execute order/i });

    fireEvent.pointerDown(btn);
    fireEvent.pointerLeave(btn);

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(onExecute).not.toHaveBeenCalled();
  });
});
