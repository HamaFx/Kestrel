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

export function toneClass(value: number): string {
  if (value > 0.005) return 'text-bull';
  if (value < -0.005) return 'text-bear';
  return 'text-fg-muted';
}

export function modeLabel(mode: 'confirm' | 'autonomous_sandbox'): string {
  return mode === 'confirm' ? 'Personal · confirm' : 'Sandbox · autonomous';
}
