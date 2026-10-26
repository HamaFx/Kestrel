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

  // text
  fg: '#e5e5e5',
  fgMuted: 'rgba(229, 229, 229, 0.6)',
  fgSubtle: 'rgba(229, 229, 229, 0.4)',

  // brand
  brand: '#ff3616',
  brandFg: '#ffffff',
  brandSoft: '#ff632a',
  brandBorder: '#441c14',

  // market states (price/P&L only)
  bull: '#3f9e3d',
  bear: '#e02c10',
  neutral: '#8a8a8a',
  warn: '#d98f00',
  info: '#4fa3b5',

  // system status
  success: '#3f9e3d',
  danger: '#e02c10',
} as const;

export type ColorToken = keyof typeof colors;

export const radii = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
} as const;

export const motion = {
  durations: {
    xfast: '80ms',
    fast: '140ms',
    base: '220ms',
    slow: '340ms',
  },
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;
