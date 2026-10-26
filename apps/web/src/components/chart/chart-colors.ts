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

// Shared color constants for chart-related UI. Mirror the design tokens in
// apps/web/src/app/globals.css under --color-bull / --color-bear.
// Hex literals because canvas-based rendering can be flaky with oklch
// literals on older iOS Safari.

export const SERIES_BULL_HEX = '#3f9e3d'; // mirrors --color-bull
export const SERIES_BEAR_HEX = '#e02c10'; // mirrors --color-bear

// Area-chart chrome (lightweight-charts canvas options are not styleable via
// CSS, so the axis text + grid lines live here next to the series colors).
export const CHART_AXIS_TEXT_HEX = '#8a8a8a'; // mirrors --color-neutral
export const CHART_GRID_HEX = '#1f1f1f'; // mirrors --color-divider

// Translucent fills for area-series gradients over the dark canvas.
export const SERIES_BULL_FILL = 'rgba(63, 158, 61, 0.22)';
export const SERIES_BEAR_FILL = 'rgba(224, 44, 16, 0.22)';
