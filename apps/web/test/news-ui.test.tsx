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

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewsToolbar } from '@/app/(app)/news/_components/news-toolbar';

afterEach(cleanup);

describe('News toolbar (Phase 10)', () => {
  const baseProps = {
    query: '',
    onQuery: vi.fn(),
    sentiment: 'all' as const,
    onSentiment: vi.fn(),
    symbol: 'all' as const,
    onSymbol: vi.fn(),
    symbolOptions: [] as string[],
    visibleCount: 3,
    totalCount: 10,
  };

  it('announces the filtered result count via a polite live region', () => {
    render(<NewsToolbar {...baseProps} />);
    const strip = screen.getByText(
      (content, el) => el?.tagName === 'P' && content.includes('Showing') && content.includes('of'),
    );
    expect(strip.getAttribute('aria-live')).toBe('polite');
  });

  it('exposes focus-visible rings on sentiment chips', () => {
    render(<NewsToolbar {...baseProps} />);
    const chips = screen.getAllByRole('radio');
    expect(chips.length).toBeGreaterThan(0);
    chips.forEach((chip) => {
      expect(chip.className).toContain('focus-visible:ring-2');
    });
  });

  it('renders the clear-search action with an accessible label', () => {
    render(<NewsToolbar {...baseProps} query="gold" />);
    expect(screen.getByRole('button', { name: /clear search/i })).toBeTruthy();
  });

  it('renders symbol chips only when options exist', () => {
    const { rerender } = render(<NewsToolbar {...baseProps} />);
    expect(screen.queryByRole('radiogroup', { name: /filter by symbol/i })).toBeNull();

    rerender(<NewsToolbar {...baseProps} symbolOptions={['XAUUSD', 'EURUSD']} />);
    expect(screen.getByRole('radiogroup', { name: /filter by symbol/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'XAUUSD' })).toBeTruthy();
  });
});
