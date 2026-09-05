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

import { cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

vi.mock('next-view-transitions', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

import { Segmented, type SegmentedOption } from '../segmented';

const TIMEFRAME_OPTIONS: SegmentedOption<string>[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

describe('Tier 1: Segmented Control Touch Targets & Tactile Press (>=5 tests)', () => {
  it('ensures size="sm" applies h-10 sm:h-9 (guaranteeing >=40px touch height on mobile)', () => {
    const { container } = render(
      <Segmented
        value="1m"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
        size="sm"
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(6);
    for (const btn of buttons) {
      expect(btn.className).toContain('h-10');
      expect(btn.className).toContain('sm:h-9');
    }
  });

  it('ensures size="sm" items enforce min-w-[44px] sm:min-w-[36px] for mobile tap clearance', () => {
    const { container } = render(
      <Segmented
        value="1m"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
        size="sm"
      />,
    );
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('min-w-[44px]');
      expect(btn.className).toContain('sm:min-w-[36px]');
    }
  });

  it('verifies tactile micro-press travel active:translate-y-[0.5px] and tactile-press on all segments', () => {
    const { container } = render(
      <Segmented
        value="5m"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('tactile-press');
      expect(btn.className).toContain('active:translate-y-[0.5px]');
    }
  });

  it('executes onChange callback with selected value when a segment is clicked', () => {
    const handleChange = vi.fn();
    const { getByRole } = render(
      <Segmented
        value="1m"
        options={TIMEFRAME_OPTIONS}
        onChange={handleChange}
      />,
    );
    const btn15m = getByRole('tab', { name: '15m' });
    fireEvent.click(btn15m);
    expect(handleChange).toHaveBeenCalledWith('15m');
  });

  it('renders anchor tags with valid href targets when as="link" is specified', () => {
    const { container } = render(
      <Segmented
        as="link"
        value="1h"
        options={TIMEFRAME_OPTIONS}
        hrefFor={(tf) => `/chart/XAUUSD?tf=${tf}`}
      />,
    );
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(6);
    expect(links[0]?.getAttribute('href')).toBe('/chart/XAUUSD?tf=1m');
    expect(links[3]?.getAttribute('href')).toBe('/chart/XAUUSD?tf=1h');
  });

  it('highlights the active segment with proper variant styling (solid, accent, tone)', () => {
    const { getByRole } = render(
      <Segmented
        variant="solid"
        value="4h"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
      />,
    );
    const activeTab = getByRole('tab', { name: '4H' });
    expect(activeTab.className).toContain('bg-fg');
    expect(activeTab.className).toContain('text-black');
    expect(activeTab.getAttribute('aria-selected')).toBe('true');
  });
});

describe('Tier 2: Boundary Cases & Keyboard Navigation (>=5 tests)', () => {
  it('moves focus across segments using ArrowRight and ArrowLeft keyboard keys', () => {
    const { container } = render(
      <Segmented
        value="1m"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
      />,
    );
    const wrapper = container.querySelector('[role="tablist"]')!;
    const buttons = container.querySelectorAll('button');

    buttons[0]?.focus();
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(wrapper, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);

    fireEvent.keyDown(wrapper, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('moves focus to first and last items using Home and End keyboard keys', () => {
    const { container } = render(
      <Segmented
        value="15m"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
      />,
    );
    const wrapper = container.querySelector('[role="tablist"]')!;
    const buttons = container.querySelectorAll('button');

    buttons[2]?.focus();
    fireEvent.keyDown(wrapper, { key: 'End' });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);

    fireEvent.keyDown(wrapper, { key: 'Home' });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('supports role="radiogroup" for form choices with aria-checked states', () => {
    const { getByRole } = render(
      <Segmented
        role="radiogroup"
        value="5m"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
      />,
    );
    const radio5m = getByRole('radio', { name: '5m' });
    expect(radio5m.getAttribute('aria-checked')).toBe('true');

    const radio1m = getByRole('radio', { name: '1m' });
    expect(radio1m.getAttribute('aria-checked')).toBe('false');
  });

  it('handles single option gracefully without boundary exceptions', () => {
    const singleOption = [{ value: 'single', label: 'All' }];
    const { getByRole } = render(
      <Segmented
        value="single"
        options={singleOption}
        onChange={vi.fn()}
      />,
    );
    expect(getByRole('tab', { name: 'All' })).not.toBeNull();
  });

  it('renders visible label and screen-reader only srLabel correctly', () => {
    const { getByText, getByRole } = render(
      <Segmented
        label="Select Resolution"
        value="1m"
        options={TIMEFRAME_OPTIONS}
        onChange={vi.fn()}
      />,
    );
    expect(getByText('Select Resolution')).not.toBeNull();
    const tablist = getByRole('tablist');
    expect(tablist.getAttribute('aria-label')).toBe('Select Resolution');
  });
});

describe('Tier 3: Cross-Feature Context Combinations', () => {
  it('renders and operates cleanly inside a .surface-panel card context', () => {
    function CardWithPills() {
      const [selected, setSelected] = useState('5m');
      return (
        <div className="surface-panel rounded-xl p-4">
          <h3 className="text-sm font-semibold">Chart Timeframe</h3>
          <Segmented
            value={selected}
            options={TIMEFRAME_OPTIONS}
            onChange={setSelected}
          />
        </div>
      );
    }

    const { container, getByRole } = render(<CardWithPills />);
    const card = container.querySelector('.surface-panel')!;
    expect(card).not.toBeNull();
    expect(card.className).toContain('rounded-xl');

    const tab15m = getByRole('tab', { name: '15m' });
    fireEvent.click(tab15m);
    expect(tab15m.getAttribute('aria-selected')).toBe('true');
  });
});
