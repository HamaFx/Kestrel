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

// Shared design tokens for Kestrel.
// The actual Tailwind theme lives in CSS via `@theme` (Tailwind v4) — see
// `apps/web/src/app/globals.css`. This file exposes the same token *values*
// to TS code (e.g., chart series colors, dynamic styles) so we have one source
// of truth.
//
// Hex literals (not OKLCH) because canvas-based chart rendering can be flaky
// with `oklch()` on older iOS Safari. Keep these in lockstep with the
// `@theme` block in `apps/web/src/app/globals.css` and keep keys stable —
// components reference them by name.

export const colors = {
  // surfaces (dark theme baseline)
  bg: '#121212',
  bgElev1: '#161616',
  bgElev2: '#1d1d1d',
  bgElev3: '#282828',
  border: '#2c2c2c',
  divider: '#1f1f1f',
  overlay: 'rgba(0, 0, 0, 0.82)',

  // surface elevation tiers
  ground: '#eaeaea',
  card: '#1d1d1d',
  well: '#161616',
  edge: '#2c2c2c',
  sheen: 'rgba(255, 255, 255, 0.13)',
  strong: '#dadada',

  // text
  fg: '#e5e5e5',
  fgMuted: 'rgba(229, 229, 229, 0.6)',
  fgSubtle: 'rgba(229, 229, 229, 0.52)',

  // brand — Hoplite Forge Flame Orange (#FF3616)
  brand: '#ff3616',
  brandFg: '#ffffff',
  brandSoft: '#ff632a',
  brandBorder: '#441c14',

  // market states (price/P&L only — bear separated from brand orange via crimson-rose)
  bull: '#3f9e3d',
  bear: '#f03e3e',
  neutral: '#8a8a8a',
  warn: '#d98f00',
  info: '#4fa3b5',

  // system status
  success: '#3f9e3d',
  danger: '#f03e3e',
} as const;

export type ColorToken = keyof typeof colors;

// Synchronized 1-for-1 with `--radius-*` in `apps/web/src/app/globals.css`.
export const radii = {
  xs: '3px',
  sm: '4px',
  md: '6px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  pill: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.6)',
  md: '0 2px 8px -2px rgba(0, 0, 0, 0.7)',
  lg: '0 4px 16px -4px rgba(0, 0, 0, 0.8)',
  xl: '0 8px 32px -8px rgba(0, 0, 0, 0.9)',
  well: '0 1px 1px rgba(255, 255, 255, 0.06), inset 0 2px 3px -1px rgba(0, 0, 0, 0.65)',
  keycap: '2px 2.5px 0 -0.5px rgba(0, 0, 0, 0.6), 1px 1px 0 rgba(255, 255, 255, 0.18)',
} as const;

export const motion = {
  durations: {
    xfast: '80ms',
    fast: '140ms',
    base: '220ms',
    slow: '340ms',
  },
  easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  easeMechanical: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const;
