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

// Static options and shared class strings for the parameter-sweep panel.

export interface ParamRow {
  name: string;
  values: string;
}

export const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-9 w-full rounded-md border px-2.5 text-xs outline-none';

export const OBJECTIVES = [
  { value: 'expectancyR', label: 'Expectancy (R)' },
  { value: 'profitFactor', label: 'Profit factor' },
  { value: 'sharpeRatio', label: 'Sharpe ratio' },
  { value: 'returnPct', label: 'Return %' },
  { value: 'netPnl', label: 'Net P&L' },
  { value: 'maxDrawdownPct', label: 'Lowest max drawdown' },
] as const;

export const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;

export type SweepObjective = (typeof OBJECTIVES)[number]['value'];
export type SweepTimeframe = (typeof TIMEFRAMES)[number];
