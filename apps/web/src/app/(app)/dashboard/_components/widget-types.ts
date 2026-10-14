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

export type WidgetType =
  | 'today-glance'
  | 'briefing'
  | 'quant-desk'
  | 'pnl-heatmap'
  | 'equity-curve'
  | 'watchlist'
  | 'open-positions'
  | 'alerts'
  | 'calendar'
  | 'news-pulse'
  | 'stats';

export interface WidgetConfig {
  /** Stable widget id used as the drag-sortable key. */
  id: string;
  type: WidgetType;
  /** Grid span on desktop. 1 = Compact, 2 = Wide, 3 = Full Width. */
  span: 1 | 2 | 3;
  /** Sort order (low → left / top). Persisted in localStorage. */
  order: number;
}

/**
 * Curated 6-widget default layout so new and returning traders get immediate
 * high-signal market context without empty-state overload. Additional widgets
 * (Performance Curve, P&L Heatmap, Open Positions, etc.) can be added in 1 click.
 */
export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'w1', type: 'today-glance', span: 3, order: 0 },
  { id: 'w2', type: 'briefing', span: 2, order: 1 },
  { id: 'w6', type: 'watchlist', span: 1, order: 2 },
  { id: 'w9', type: 'calendar', span: 1, order: 3 },
  { id: 'w10', type: 'news-pulse', span: 1, order: 4 },
  { id: 'w8', type: 'alerts', span: 1, order: 5 },
];

export const LAYOUT_STORAGE_KEY = 'kestrel:dashboard-layout:v1';

/** Human-readable label rendered on the edit-mode toolbar. */
export const WIDGET_LABELS: Record<WidgetType, string> = {
  'today-glance': 'Today at a Glance',
  briefing: 'AI Market Briefing',
  'quant-desk': '4-Desk AI Committee',
  'pnl-heatmap': 'P&L Heatmap',
  'equity-curve': 'Performance Curve',
  watchlist: 'Watchlist',
  'open-positions': 'Open Positions',
  alerts: 'Price Alerts',
  calendar: 'Economic Calendar',
  'news-pulse': 'News Pulse',
  stats: 'Performance Stats',
};

export type LayoutPresetName = 'default' | 'day_trader' | 'macro' | 'risk';

export const PRESET_LAYOUTS: Record<
  LayoutPresetName,
  { name: string; description: string; layout: WidgetConfig[] }
> = {
  default: {
    name: 'Essential Overview',
    description: 'Core 6 market intelligence widgets',
    layout: DEFAULT_LAYOUT,
  },
  day_trader: {
    name: 'Day Trader',
    description: 'Watchlist, open positions, alerts, and calendar up front',
    layout: [
      { id: 'w-dt-1', type: 'watchlist', span: 1, order: 0 },
      { id: 'w-dt-2', type: 'open-positions', span: 2, order: 1 },
      { id: 'w-dt-3', type: 'today-glance', span: 3, order: 2 },
      { id: 'w-dt-qd', type: 'quant-desk', span: 1, order: 3 },
      { id: 'w-dt-4', type: 'alerts', span: 1, order: 4 },
      { id: 'w-dt-5', type: 'calendar', span: 1, order: 5 },
      { id: 'w-dt-6', type: 'news-pulse', span: 1, order: 6 },
      { id: 'w-dt-7', type: 'stats', span: 1, order: 7 },
    ],
  },
  macro: {
    name: 'Macro & News',
    description: 'Economic calendar, tagged headlines, and AI daily briefing',
    layout: [
      { id: 'w-mc-1', type: 'briefing', span: 2, order: 0 },
      { id: 'w-mc-qd', type: 'quant-desk', span: 1, order: 1 },
      { id: 'w-mc-2', type: 'calendar', span: 2, order: 2 },
      { id: 'w-mc-3', type: 'news-pulse', span: 1, order: 3 },
      { id: 'w-mc-4', type: 'today-glance', span: 3, order: 4 },
      { id: 'w-mc-5', type: 'watchlist', span: 1, order: 5 },
      { id: 'w-mc-6', type: 'pnl-heatmap', span: 2, order: 6 },
    ],
  },
  risk: {
    name: 'Performance & Risk',
    description: 'Equity curves, P&L heatmap, stats, and open risk',
    layout: [
      { id: 'w-rk-1', type: 'pnl-heatmap', span: 3, order: 0 },
      { id: 'w-rk-2', type: 'equity-curve', span: 2, order: 1 },
      { id: 'w-rk-3', type: 'stats', span: 1, order: 2 },
      { id: 'w-rk-4', type: 'open-positions', span: 2, order: 3 },
      { id: 'w-rk-5', type: 'today-glance', span: 1, order: 4 },
    ],
  },
};
