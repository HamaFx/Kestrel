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

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatEmptyState } from '@/components/chat/chat-empty-state';
import { EmptyState } from '@/components/ui/empty-state';

// Mock next/image to render a plain <img> in jsdom.
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { unoptimized, ...rest } = props as React.ImgHTMLAttributes<HTMLImageElement> & {
      unoptimized?: boolean;
    };
    return <img {...rest} alt="" />;
  },
}));

afterEach(cleanup);

describe('EmptyState', () => {
  const defaultIcon = <span data-testid="test-icon">🔍</span>;

  it('renders title and icon', () => {
    render(<EmptyState icon={defaultIcon} title="No data found" />);
    expect(screen.getByText('No data found')).toBeTruthy();
    expect(screen.getByTestId('test-icon')).toBeTruthy();
  });

  it('renders with role="status" and correct aria-label', () => {
    render(<EmptyState icon={defaultIcon} title="No results" />);
    const el = screen.getByRole('status');
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-label')).toBe('No results');
  });

  it('renders description when provided', () => {
    render(
      <EmptyState icon={defaultIcon} title="Empty" description="There is nothing here yet." />,
    );
    expect(screen.getByText('There is nothing here yet.')).toBeTruthy();
  });

  it('does not render description when omitted', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    // Should only be one paragraph (the title), no description paragraph
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(1);
  });

  it('renders action when provided', () => {
    render(<EmptyState icon={defaultIcon} title="Empty" action={<button>Create</button>} />);
    expect(screen.getByText('Create')).toBeTruthy();
  });

  it('does not render action when omitted', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('has border by default (bare=false)', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    const div = container.querySelector('[role="status"]');
    expect(div!.classList.contains('border')).toBe(true);
  });

  it('removes border when bare=true', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" bare />);
    const div = container.querySelector('[role="status"]');
    expect(div!.classList.contains('border')).toBe(false);
  });

  it('applies brand icon container size for tone="brand"', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" tone="brand" />);
    const iconSpan = container.querySelector('[aria-hidden="true"]');
    expect(iconSpan!.classList.contains('h-20')).toBe(true);
    expect(iconSpan!.classList.contains('w-20')).toBe(true);
  });

  it('applies muted icon container size for tone="muted" (default)', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    const iconSpan = container.querySelector('[aria-hidden="true"]');
    expect(iconSpan!.classList.contains('h-16')).toBe(true);
    expect(iconSpan!.classList.contains('w-16')).toBe(true);
  });

  it('applies additional className', () => {
    const { container } = render(
      <EmptyState icon={defaultIcon} title="Empty" className="my-custom-class" />,
    );
    const div = container.querySelector('[role="status"]');
    expect(div!.classList.contains('my-custom-class')).toBe(true);
  });
});

describe('ChatEmptyState — Sovereign Council launcher', () => {
  it('renders the Convene Full 4-Desk Council hero and all four canonical specialist desks', () => {
    render(<ChatEmptyState pinnedSymbol="XAUUSD" onSelect={vi.fn()} />);

    expect(screen.getByText('Convene the Full 4-Desk Council')).toBeTruthy();
    expect(screen.getByText(/Convene 4-Desk Syndicate/i)).toBeTruthy();

    expect(screen.getByText('DESK-I // HORUS')).toBeTruthy();
    expect(screen.getByText('DESK-II // ASTROLABE')).toBeTruthy();
    expect(screen.getByText('DESK-III // HOPLITE')).toBeTruthy();
    expect(screen.getByText('DESK-IV // SENTINEL')).toBeTruthy();
  });

  it('dispatches the full council prompt with a full mode override', () => {
    const onSelect = vi.fn();
    render(<ChatEmptyState pinnedSymbol="XAUUSD" onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Convene the Full 4-Desk Council').closest('button')!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [prompt, mode] = onSelect.mock.calls[0]!;
    expect(String(prompt)).toMatch(/full 4-desk council/i);
    expect(mode).toBe('full');
  });

  it('routes a specialist desk card through Fast Scout with that desk lens', () => {
    const onSelect = vi.fn();
    render(<ChatEmptyState pinnedSymbol="XAUUSD" onSelect={onSelect} />);

    fireEvent.click(screen.getByText('DESK-III // HOPLITE').closest('button')!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [prompt, mode] = onSelect.mock.calls[0]!;
    expect(String(prompt)).toMatch(/risk|invalidation/i);
    expect(mode).toBe('single');
  });

  it('keeps the sovereign watermark and honours the disabled state', () => {
    const onSelect = vi.fn();
    render(<ChatEmptyState pinnedSymbol={null} disabled onSelect={onSelect} />);
    expect(screen.getByText('KESTREL // SOVEREIGN COUNCIL')).toBeTruthy();
    expect(
      (screen.getByText('Convene the Full 4-Desk Council').closest('button') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
