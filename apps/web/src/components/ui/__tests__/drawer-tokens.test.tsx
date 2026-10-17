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
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

import { ConfirmDrawer } from '../confirm-drawer';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '../drawer';
import { Segmented } from '../segmented';

vi.mock('next-view-transitions', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

describe('Tier 1: Drawer & ConfirmDrawer Cyber-Industrial Tokens (>=5 tests)', () => {
  it('applies surface-panel, rounded-t-xl, and border-t border-border to DrawerContent', () => {
    render(
      <Drawer open={true}>
        <DrawerContent>
          <DrawerTitle>Test Drawer</DrawerTitle>
          <DrawerDescription className="sr-only">Test description</DrawerDescription>
          <div>Drawer body</div>
        </DrawerContent>
      </Drawer>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('surface-panel');
    expect(dialog.className).toContain('rounded-t-xl');
    expect(dialog.className).toContain('border-t');
    expect(dialog.className).toContain('border-border');
  });

  it('enforces safe-area bottom padding pb-[max(env(safe-area-inset-bottom),16px)] on DrawerContent', () => {
    render(
      <Drawer open={true}>
        <DrawerContent>
          <DrawerTitle>Safe Area Test</DrawerTitle>
          <DrawerDescription className="sr-only">Safe area description</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('pb-[max(env(safe-area-inset-bottom),16px)]');
  });

  it('renders top swipe handle with rounded-sm and centered geometry', () => {
    render(
      <Drawer open={true}>
        <DrawerContent>
          <DrawerTitle>Handle Test</DrawerTitle>
          <DrawerDescription className="sr-only">Handle description</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    const handle = dialog.querySelector('div[aria-hidden="true"]');
    expect(handle).not.toBeNull();
    expect(handle?.className).toContain('rounded-sm');
    expect(handle?.className).toContain('mx-auto');
    expect(handle?.className).toContain('w-12');
  });

  it('standardizes ConfirmDrawer container to surface-panel rounded-t-xl border-t border-border', () => {
    render(
      <ConfirmDrawer
        open={true}
        onOpenChange={vi.fn()}
        title="Confirm Order"
        description="Are you sure you want to execute this order?"
        onConfirm={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('surface-panel');
    expect(dialog.className).toContain('rounded-t-xl');
    expect(dialog.className).toContain('border-t');
    expect(dialog.className).toContain('border-border');
  });

  it('ensures ConfirmDrawer action buttons meet >=40px touch targets (w-full size="md")', () => {
    render(
      <ConfirmDrawer
        open={true}
        onOpenChange={vi.fn()}
        title="Execute Trade"
        confirmLabel="Execute"
        cancelLabel="Abort"
        onConfirm={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: 'Execute' });
    const cancelBtn = screen.getByRole('button', { name: 'Abort' });

    expect(confirmBtn.className).toContain('h-10');
    expect(confirmBtn.className).toContain('w-full');
    expect(cancelBtn.className).toContain('h-10');
    expect(cancelBtn.className).toContain('w-full');
  });
});

describe('Tier 2: Drawer Boundary & Corner Cases (>=5 tests)', () => {
  it('clamps drawer height with max-h-[92svh] to prevent full viewport lock', () => {
    render(
      <Drawer open={true}>
        <DrawerContent>
          <DrawerTitle>Height Clamp</DrawerTitle>
          <DrawerDescription className="sr-only">Height clamp description</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-[92svh]');
  });

  it('renders danger tone with rounded-md icon container meeting 40x40px (h-10 w-10)', () => {
    render(
      <ConfirmDrawer
        open={true}
        tone="danger"
        title="Delete Position"
        description="Irreversible operation"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const dangerIcon = dialog.querySelector('span.text-danger');
    expect(dangerIcon).not.toBeNull();
    expect(dangerIcon?.className).toContain('rounded-md');
    expect(dangerIcon?.className).toContain('h-10');
    expect(dangerIcon?.className).toContain('w-10');
  });

  it('disables actions and indicates busy state when busy={true}', () => {
    render(
      <ConfirmDrawer
        open={true}
        busy={true}
        title="Processing"
        confirmLabel="Submitting"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: 'Submitting…' }) as HTMLButtonElement;
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;

    expect(confirmBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
    expect(confirmBtn.className).toContain('opacity-70');
  });

  it('triggers onConfirm callback when confirm button is clicked', () => {
    const handleConfirm = vi.fn();
    render(
      <ConfirmDrawer
        open={true}
        title="Confirm Action"
        confirmLabel="Yes, Continue"
        onOpenChange={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: 'Yes, Continue' });
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenChange(false) when cancel button is clicked', () => {
    const handleOpenChange = vi.fn();
    render(
      <ConfirmDrawer
        open={true}
        title="Cancel Action"
        cancelLabel="Dismiss"
        onOpenChange={handleOpenChange}
        onConfirm={vi.fn()}
      />,
    );
    const cancelBtn = screen.getByRole('button', { name: 'Dismiss' });
    fireEvent.click(cancelBtn);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Tier 3: Cross-Feature Combinations (Segmented Control inside Drawer)', () => {
  it('allows user interaction with a Segmented control inside DrawerContent without dismissing drawer', () => {
    function DrawerWithSegmented() {
      const [val, setVal] = useState('1m');
      return (
        <Drawer open={true}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Timeframe Settings</DrawerTitle>
              <DrawerDescription>Adjust the chart timeframe below</DrawerDescription>
            </DrawerHeader>
            <div className="p-4">
              <Segmented
                value={val}
                options={[
                  { value: '1m', label: '1m' },
                  { value: '5m', label: '5m' },
                  { value: '15m', label: '15m' },
                ]}
                onChange={setVal}
              />
            </div>
            <DrawerFooter>
              <button type="button" className="h-10 w-full rounded-md bg-brand text-white">
                Save
              </button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      );
    }

    render(<DrawerWithSegmented />);
    const tab5m = screen.getByRole('tab', { name: '5m' });
    fireEvent.click(tab5m);
    expect(tab5m.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('dialog')).not.toBeNull();
  });
});
