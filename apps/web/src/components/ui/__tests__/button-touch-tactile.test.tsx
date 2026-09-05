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
import React, { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

import { Button } from '../button';

describe('Tier 1: Button Touch Targets & Tactile Micro-Press (>=5 tests)', () => {
  it('ensures size="sm" satisfies the touch-accessible minimum standard (h-10 / 40px)', () => {
    const { container } = render(<Button size="sm">Action</Button>);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('h-10');
    expect(button.className).toContain('rounded-md');
  });

  it('ensures size="md" (default) satisfies the 40px touch-accessible target (h-10 px-4)', () => {
    const { container } = render(<Button>Default Target</Button>);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('h-10');
    expect(button.className).toContain('px-4');
  });

  it('ensures size="lg" provides large CTA thumb-zone dimensions (h-12 sm:h-14 px-5)', () => {
    const { container } = render(<Button size="lg">Primary CTA</Button>);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('h-12');
    expect(button.className).toContain('sm:h-14');
  });

  it('verifies tactile-press active physical depression on tactical variant without layout shift', () => {
    const { container } = render(<Button variant="tactical">Launch Analysis</Button>);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('tactile-press');
    expect(button.className).toContain('active:translate-y-[0.5px]');
    expect(button.className).not.toContain('active:scale-95');
  });

  it.each([
    ['primary', 'active:translate-y-[0.5px]'],
    ['secondary', 'active:translate-y-[0.5px]'],
    ['surface', 'active:translate-y-[0.5px]'],
    ['ghost', 'active:translate-y-[0.5px]'],
    ['danger', 'active:translate-y-[0.5px]'],
    ['success', 'active:translate-y-[0.5px]'],
  ] as const)('applies tactile micro-press travel active:translate-y-[0.5px] to variant "%s"', (variant, expectedClass) => {
    const { container } = render(<Button variant={variant}>Press Me</Button>);
    const button = container.querySelector('button')!;
    expect(button.className).toContain(expectedClass);
  });
});

describe('Tier 2: Button Boundary & Corner Cases (>=5 tests)', () => {
  it('disables interactions and applies disabled styles when disabled is true', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <Button disabled onClick={handleClick}>
        Disabled Action
      </Button>,
    );
    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain('disabled:cursor-not-allowed');
    expect(button.className).toContain('disabled:opacity-60');

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('indicates busy state with spinner and suppresses click events when loading is true', () => {
    const handleClick = vi.fn();
    const { getByRole } = render(
      <Button loading onClick={handleClick}>
        Saving Changes
      </Button>,
    );
    const button = getByRole('button', { name: /saving changes/i }) as HTMLButtonElement;
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);

    // Spinner is rendered with animate-spin class
    const spinner = button.querySelector('svg');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute('class')).toContain('animate-spin');

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('safely merges custom className without breaking base interactive styles', () => {
    const { container } = render(
      <Button className="w-full uppercase tracking-wider" size="md">
        Full Width Button
      </Button>,
    );
    const button = container.querySelector('button')!;
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('uppercase');
    expect(button.className).toContain('h-10');
  });

  it('forwards ref directly to underlying HTMLButtonElement for programmatic focus', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Focusable Target</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it('defaults to type="button" to prevent inadvertent form submissions', () => {
    const { container } = render(<Button>Safe Button</Button>);
    const button = container.querySelector('button')!;
    expect(button.getAttribute('type')).toBe('button');
  });

  it('supports size="xs" for compact toolbars with rounded-md geometry', () => {
    const { container } = render(<Button size="xs">Compact</Button>);
    const button = container.querySelector('button')!;
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('rounded-md');
  });
});
