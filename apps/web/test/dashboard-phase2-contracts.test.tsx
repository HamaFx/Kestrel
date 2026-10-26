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

// SPDX-License-Identifier: Apache-2.0

// Phase 2 dashboard contracts:
//   - open risk reports the position count + symbols (never `N × 1R`);
//   - the P&L heatmap legend runs Loss → red ramp → neutral → green ramp → Gain;
//   - `PerformanceChart bare` drops its panel + Net R-Score header so the
//     dashboard equity widget does not render two headers for one chart.

import type { JournalEntry } from '@kestrel/shared';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { MissionControlDeck } from '@/app/(app)/dashboard/_components/mission-control-deck';
import { EquityCurveWidget } from '@/app/(app)/dashboard/_components/widgets/equity-curve-widget';
import { PnLHeatmapWidget } from '@/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget';
import { TodayGlanceWidget } from '@/app/(app)/dashboard/_components/widgets/today-glance-widget';
import { PerformanceChart } from '@/components/chart/performance-chart';
import { TimeProvider } from '@/components/providers/time-provider';

// The day-trades drawer pulls the journal EntryList (and through it the
// server-action graph). The legend contract needs none of that.
vi.mock('@/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget/day-trades-drawer', () => ({
  DayTradesDrawer: () => null,
}));

beforeAll(() => {
  // jsdom ships no matchMedia; TimeProvider reads the reduced-motion query.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(cleanup);

function makeEntry(partial: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'entry-1',
    symbol: 'XAUUSD',
    side: 'long',
    openedAt: Date.now(),
    closedAt: null,
    entry: 2000,
    stop: 1990,
    target: 2030,
    exit: null,
    size: 1,
    outcome: 'open',
    rMultiple: null,
    notes: null,
    tags: [],
    attachments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  } as JournalEntry;
}

describe('TodayGlanceWidget — open risk cell', () => {
  it('counts positions and lists symbols instead of faking 1R per position', () => {
    render(
      <TimeProvider>
        <TodayGlanceWidget
          events={[]}
          entries={[
            makeEntry({ id: 'a', symbol: 'XAUUSD', stop: 1990 }),
            makeEntry({ id: 'b', symbol: 'EURUSD', stop: null }),
          ]}
          briefingNudge={null}
        />
      </TimeProvider>,
    );

    expect(screen.getByText('2 positions')).toBeTruthy();
    expect(screen.getByText('XAUUSD, EURUSD')).toBeTruthy();
    expect(screen.getByText('1 no stop')).toBeTruthy();
    expect(screen.queryByText(/R at risk/)).toBeNull();
  });

  it('singularises a single open position and omits the no-stop chip when all have stops', () => {
    render(
      <TimeProvider>
        <TodayGlanceWidget
          events={[]}
          entries={[makeEntry({ id: 'a', symbol: 'GBPUSD', stop: 1.25 })]}
          briefingNudge={null}
        />
      </TimeProvider>,
    );

    expect(screen.getByText('1 position')).toBeTruthy();
    expect(screen.queryByText(/no stop/)).toBeNull();
  });

  it('reports no open risk when every position is closed', () => {
    render(
      <TimeProvider>
        <TodayGlanceWidget
          events={[]}
          entries={[makeEntry({ id: 'a', outcome: 'win', closedAt: Date.now() })]}
          briefingNudge={null}
        />
      </TimeProvider>,
    );

    expect(screen.getByText('No open risk')).toBeTruthy();
  });
});

describe('PnLHeatmapWidget — legend', () => {
  it('runs Loss → bearish ramp (descending) → neutral → bullish ramp (ascending) → Gain', () => {
    render(<PnLHeatmapWidget entries={[]} />);

    const legend = screen.getByText('Loss').parentElement;
    expect(legend).not.toBeNull();

    const labels = Array.from(legend!.children)
      .filter((el) => el.tagName === 'SPAN')
      .map((el) => el.textContent);
    expect(labels).toEqual(['Loss', 'Gain']);
    expect(legend!.firstElementChild?.textContent).toBe('Loss');
    expect(legend!.lastElementChild?.textContent).toBe('Gain');

    const swatches = Array.from(legend!.querySelectorAll('span.size-3'));
    expect(swatches).toHaveLength(9);
    expect(swatches.map((el) => (el as HTMLElement).style.opacity || 'neutral')).toEqual([
      '0.85',
      '0.6',
      '0.4',
      '0.2',
      'neutral',
      '0.2',
      '0.4',
      '0.6',
      '0.85',
    ]);
  });
});

const closedEntries: JournalEntry[] = [
  makeEntry({
    id: 'c1',
    outcome: 'win',
    closedAt: Date.now() - 86_400_000,
    exit: 2030,
    rMultiple: 3,
  }),
  makeEntry({
    id: 'c2',
    outcome: 'loss',
    closedAt: Date.now() - 43_200_000,
    exit: 1995,
    rMultiple: -0.5,
  }),
];

describe('PerformanceChart — bare mode', () => {
  it('drops the panel chrome and Net R-Score header when bare', () => {
    const { container } = render(<PerformanceChart entries={[]} height={200} bare />);

    expect(screen.getByText('Not enough closed trades yet')).toBeTruthy();
    expect(container.querySelector('.surface-panel')).toBeNull();
    expect(screen.queryByText('Net R-Score')).toBeNull();
    expect(screen.queryByText('Performance Curve')).toBeNull();
  });

  it('keeps its own panel and header when not bare', () => {
    const { container } = render(<PerformanceChart entries={[]} />);

    expect(container.querySelector('.surface-panel')).not.toBeNull();
    expect(screen.getByText('Performance Curve Loading')).toBeTruthy();
  });

  it('drops the Net R-Score header for a plotted bare curve', () => {
    const { container } = render(
      <PerformanceChart entries={closedEntries} height={200} bare />,
    );

    expect(screen.queryByText('Net R-Score')).toBeNull();
    expect(screen.queryByText('Performance Curve')).toBeNull();
    expect(container.querySelector('.surface-panel')).toBeNull();
  });

  it('renders the Net R-Score header once for a plotted standalone curve', () => {
    render(<PerformanceChart entries={closedEntries} />);

    expect(screen.getByText('Net R-Score')).toBeTruthy();
    expect(screen.getAllByText('Performance Curve')).toHaveLength(1);
  });
});

describe('EquityCurveWidget — single header', () => {
  it('owns the only Performance header and never nests a second chart panel', () => {
    render(<EquityCurveWidget entries={[]} />);

    expect(screen.getAllByText('Performance')).toHaveLength(1);
    expect(screen.queryByText('Performance Curve')).toBeNull();
    expect(screen.queryByText('Net R-Score')).toBeNull();
    expect(screen.getByText('Not enough closed trades yet')).toBeTruthy();
  });

  it('renders exactly one header and one net-R badge for a plotted curve', () => {
    render(<EquityCurveWidget entries={closedEntries} />);

    // The chart is mounted bare: no second "Performance Curve" header and no
    // second Net R badge inside the widget card.
    expect(screen.getAllByText('Performance')).toHaveLength(1);
    expect(screen.queryByText('Performance Curve')).toBeNull();
    expect(screen.queryByText('Net R-Score')).toBeNull();
  });
});

describe('MissionControlDeck — council CTA', () => {
  it('links to the valid ?mode=full analysis mode, never the ignored ?mode=council', () => {
    render(<MissionControlDeck />);

    const cta = screen.getByRole('link', { name: /Convene Full Council/i });
    expect(cta.getAttribute('href')).toBe('/chat?mode=full');
  });
});
