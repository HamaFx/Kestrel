/**
 * @vitest-environment happy-dom
 */
import type { JournalEntry, JournalStatsWithNulls } from '@kestrel/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DrawdownChart } from '@/app/(app)/journal/_components/analytics/drawdown-chart';
import { JournalComposedChart } from '@/app/(app)/journal/_components/analytics/journal-composed-chart';
import { RDistribution } from '@/app/(app)/journal/_components/analytics/r-distribution';
import { DayOfWeekChart } from '@/app/(app)/journal/_components/stats-summary/day-of-week-chart';
import { OutcomeDistribution } from '@/app/(app)/journal/_components/stats-summary/outcome-distribution';
import { DailyActivityChart } from '@/app/(app)/settings/usage/_components/daily-activity-chart';
import { formatAxisValue, smoothPath } from '@/components/chart/chart-geometry';
import { PerformanceChart } from '@/components/chart/performance-chart';
import { ProfitLossLine } from '@/components/chart/profit-loss-line';
import { CandleSparkline } from '@/components/chat/parts/get-candles-sparkline';
import { VolatilityConePlot } from '@/components/chat/parts/volatility-cone-plot';
import { RingGauge } from '@/components/ui/ring-gauge';
import { Sparkline } from '@/components/ui/sparkline';

const SAMPLE_ENTRIES: JournalEntry[] = [
  {
    id: 'e1',
    userId: 'u1',
    symbol: 'XAUUSD',
    direction: 'long',
    entry: 2600,
    stop: 2590,
    target: 2625,
    exitPrice: 2620,
    outcome: 'win',
    rMultiple: 2.0,
    notes: null,
    tags: [],
    mindset: 'disciplined',
    screenshotUrl: null,
    openedAt: Date.UTC(2026, 9, 1, 9, 0),
    closedAt: Date.UTC(2026, 9, 1, 14, 0),
  },
  {
    id: 'e2',
    userId: 'u1',
    symbol: 'EURUSD',
    direction: 'short',
    entry: 1.095,
    stop: 1.098,
    target: 1.089,
    exitPrice: 1.098,
    outcome: 'loss',
    rMultiple: -1.0,
    notes: null,
    tags: [],
    mindset: 'disciplined',
    screenshotUrl: null,
    openedAt: Date.UTC(2026, 9, 2, 10, 0),
    closedAt: Date.UTC(2026, 9, 2, 16, 0),
  },
  {
    id: 'e3',
    userId: 'u1',
    symbol: 'GBPUSD',
    direction: 'long',
    entry: 1.305,
    stop: 1.301,
    target: 1.315,
    exitPrice: 1.313,
    outcome: 'win',
    rMultiple: 2.0,
    notes: null,
    tags: [],
    mindset: 'confident',
    screenshotUrl: null,
    openedAt: Date.UTC(2026, 9, 3, 11, 0),
    closedAt: Date.UTC(2026, 9, 3, 18, 0),
  },
];

const SAMPLE_STATS: JournalStatsWithNulls = {
  count: 3,
  wins: 2,
  losses: 1,
  breakeven: 0,
  open: 0,
  winRate: 2 / 3,
  avgR: 1.0,
  totalR: 3.0,
  bestR: 2.0,
  worstR: -1.0,
  longestWinStreak: 1,
  longestLossStreak: 1,
  currentStreak: { type: 'win', count: 1 },
  maxWinStreak: 1,
  maxLossStreak: 1,
  avgHoldMs: 18_000_000,
  perDayOfWeek: {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 0,
    thursday: 1,
    friday: 3,
    saturday: 0,
  },
  rDistribution: [
    { bucket: '<-2', count: 0 },
    { bucket: '[-2,-1]', count: 0 },
    { bucket: '[-1,0]', count: 1 },
    { bucket: '[0,0]', count: 0 },
    { bucket: '[0,1]', count: 0 },
    { bucket: '[1,2]', count: 2 },
    { bucket: '[2,3]', count: 0 },
    { bucket: '>3', count: 0 },
  ],
};

describe('Kestrel Bklit chart components & geometry', () => {
  it('computes monotone cubic Hermite paths and compact axis numbers', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 10, y: 20 }])).toBe('M 10.00 20.00');
    const curve = smoothPath([
      { x: 0, y: 40 },
      { x: 50, y: 10 },
      { x: 100, y: 25 },
    ]);
    expect(curve).toContain('M 0.00 40.00 C');
    expect(formatAxisValue(1500)).toBe('1.5k');
    expect(formatAxisValue(-2_400_000)).toBe('-2.4m');
    expect(formatAxisValue(0.45)).toBe('0.45');
  });

  it('server-renders Bklit-backed ProfitLossLine, PerformanceChart, and DrawdownChart', () => {
    const plHtml = renderToStaticMarkup(
      createElement(ProfitLossLine, {
        values: [0.5, -0.4, 1.8, 2.3],
        labels: ['10-01', '10-02', '10-03', '10-04'],
        ariaLabel: 'Sample P&L curve',
        measure: true,
      }),
    );
    expect(plHtml).toContain('ts-chart');
    expect(plHtml).toContain('Sample P&amp;L curve');

    const perfHtml = renderToStaticMarkup(
      createElement(PerformanceChart, { entries: SAMPLE_ENTRIES }),
    );
    expect(perfHtml).toContain('Performance Curve');
    expect(perfHtml).toContain('+3.00R');

    const ddHtml = renderToStaticMarkup(
      createElement(DrawdownChart, { entries: SAMPLE_ENTRIES, stats: SAMPLE_STATS }),
    );
    expect(ddHtml).toContain('Underwater drawdown');
    expect(ddHtml).toContain('-1.00R');
  });

  it('server-renders JournalComposedChart, RDistribution, DayOfWeekChart, and DailyActivityChart', () => {
    const composedHtml = renderToStaticMarkup(
      createElement(JournalComposedChart, { entries: SAMPLE_ENTRIES }),
    );
    expect(composedHtml).toContain('Daily results &amp; equity');
    expect(composedHtml).toContain('Net +3.00R');

    const distHtml = renderToStaticMarkup(createElement(RDistribution, { stats: SAMPLE_STATS }));
    expect(distHtml).toContain('R Distribution');
    expect(distHtml).toContain('data-bkm-chart');

    const dowHtml = renderToStaticMarkup(
      createElement(DayOfWeekChart, { perDayOfWeek: SAMPLE_STATS.perDayOfWeek! }),
    );
    expect(dowHtml).toContain('Closed trades by day of week');

    const usageHtml = renderToStaticMarkup(
      createElement(DailyActivityChart, {
        daily7: [
          { date: '2026-10-01', turns: 4 },
          { date: '2026-10-02', turns: 7 },
        ],
      }),
    );
    expect(usageHtml).toContain('Daily Research Activity');
    expect(usageHtml).toContain('11 total analyses');
  });

  it('server-renders RingGauge, OutcomeDistribution, CandleSparkline, VolatilityConePlot, SimulatorSetupChart, and Sparkline', () => {
    const gaugeHtml = renderToStaticMarkup(
      createElement(RingGauge, { value: 78, tone: 'success', label: 'budget' }),
    );
    expect(gaugeHtml).toContain('78%');
    expect(gaugeHtml).toContain('budget');

    const outcomeHtml = renderToStaticMarkup(
      createElement(OutcomeDistribution, { entries: SAMPLE_ENTRIES }),
    );
    expect(outcomeHtml).toContain('67%');
    expect(outcomeHtml).toContain('Wins');

    const candleHtml = renderToStaticMarkup(
      createElement(CandleSparkline, {
        lastClose: 2655,
        candles: [
          {
            symbol: 'XAUUSD',
            tf: '1h',
            t: 1_700_000_000_000,
            o: 2640,
            h: 2652,
            l: 2638,
            c: 2650,
            v: 100,
          },
          {
            symbol: 'XAUUSD',
            tf: '1h',
            t: 1_700_003_600_000,
            o: 2650,
            h: 2660,
            l: 2648,
            c: 2655,
            v: 120,
          },
        ],
      }),
    );
    expect(candleHtml).toContain('data-bkm-chart="candlestick"');

    const coneHtml = renderToStaticMarkup(
      createElement(VolatilityConePlot, {
        symbol: 'XAUUSD',
        horizonHours: 24,
        range: { low: 2620, mid: 2650, high: 2680 },
        asOf: Date.UTC(2026, 9, 1, 12, 0),
        event: {
          title: 'US Non-Farm Payrolls',
          whenIso: new Date(Date.UTC(2026, 9, 1, 18, 0)).toISOString(),
          currency: 'USD',
        },
      }),
    );
    expect(coneHtml).toContain('ATR cone');
    expect(coneHtml).toContain('2,620.00');

    const sparkHtml = renderToStaticMarkup(
      createElement(Sparkline, {
        values: [10, 14, 12, 18, 22],
        tone: 'bull',
        variant: 'area',
        label: 'Equity',
      }),
    );
    expect(sparkHtml).toContain('Equity trend: 10 to 22');
  });
});
