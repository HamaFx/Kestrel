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

// Shared formatters and PanelUI-aligned hardware class tokens for plugin UI surfaces.

export function fmtNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${fmtNumber(Math.abs(value), 2)}`;
}

export function fmtMoneyPlain(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `$${fmtNumber(value, 2)}`;
}

export function fmtPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmtNumber(value, digits)}%`;
}

export function fmtR(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmtNumber(value, 2)}R`;
}

export function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 6;
  return fmtNumber(value, digits);
}

export function fmtQty(value: number): string {
  return fmtNumber(value, Math.abs(value) < 1 ? 4 : 2);
}

export function fmtDate(value: string | number): string {
  if (value === 0 || value === '0') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function toneClass(value: number, epsilon = 0.0001): string {
  if (value > epsilon) return 'text-bull';
  if (value < -epsilon) return 'text-bear';
  return 'text-fg-muted';
}

/**
 * Polarity-aware trend tone helper matching `<KpiTrend goodDirection="up" | "down">`.
 * Use `goodDirection = 'down'` for Drawdown, Slippage, Latency, and Error Rate.
 */
export function trendToneClass(
  value: number,
  goodDirection: 'up' | 'down' = 'up',
  epsilon = 0.0001,
): string {
  if (!Number.isFinite(value) || Math.abs(value) <= epsilon) return 'text-fg-muted';
  const isGood = goodDirection === 'up' ? value > 0 : value < 0;
  return isGood ? 'text-bull' : 'text-bear';
}

/**
 * Shared PanelUI-inspired hardware class tokens for `@kestrel/plugin-*` UIs
 * so plugins render concentric frames, shared-hairline KPI strips, recessed
 * inputs, and dark tables identically to `@kestrel/web`.
 */
export const PLUGIN_UI_CLASSES = {
  frame:
    'border-border/70 bg-bg-elev-1/75 flex flex-col gap-1 rounded-[20px] border p-1.5 shadow-[var(--shadow-sm)]',
  frameHeader: 'flex flex-wrap items-center justify-between gap-2 px-2.5 py-1',
  frameTitle: 'text-fg-subtle font-mono text-[10px] font-semibold tracking-[0.14em] uppercase',
  framePanel: 'surface-card rounded-[14px] border border-white/[0.07] p-4',
  framePanelBand:
    'surface-card divide-y divide-white/[0.06] overflow-hidden rounded-[14px] border border-white/[0.07] p-0',
  kpiGroup:
    'grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-4',
  kpiCell: 'bg-[#0d0e10] flex min-w-0 flex-col justify-between gap-1 p-3',
  kpiLabel:
    'text-fg-subtle flex items-center gap-1 truncate font-mono text-[9px] font-semibold tracking-wider uppercase',
  kpiValue: 'font-mono text-sm font-bold tracking-tight tabular-nums sm:text-base',
  kpiHint: 'text-fg-subtle truncate font-mono text-[10px] tabular-nums',
  input:
    'surface-well border-border text-fg placeholder:text-fg-subtle hover:border-white/20 focus:border-brand/60 focus-visible:ring-brand h-10 w-full rounded-lg border px-3 font-mono text-xs transition-all focus:bg-[#121316] focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
  fieldLabel: 'text-fg-subtle font-mono text-[10px] font-semibold tracking-wider uppercase',
  buttonPrimary:
    'tactile-press bg-brand border-brand/60 focus-visible:ring-brand inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium text-white shadow-[0_4px_14px_rgba(255,54,22,0.32),inset_0_1px_0_rgba(255,255,255,0.32)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
  buttonSecondary:
    'tactile-press surface-button text-fg focus-visible:ring-brand inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.09] px-3.5 text-xs font-semibold transition-all hover:border-white/[0.18] hover:brightness-110 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
  tableWrap: 'overflow-x-auto rounded-xl border border-white/[0.07] bg-[#121315]',
  table: 'w-full border-collapse text-left text-xs',
  tableHead: 'bg-[#101113] text-fg-subtle font-mono text-[9px] tracking-[0.12em] uppercase',
  tableBody: 'divide-y divide-white/[0.06]',
  tableRow: 'bg-[#121315] transition-colors hover:bg-white/[0.03]',
} as const;
