#!/usr/bin/env node
// @ts-check
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

/**
 * pwa-screens/kit.mjs — shared primitives for the manifest screenshot art.
 *
 * The screenshots referenced by `app/manifest.ts` are illustrative, static
 * artwork: they never capture a real account, market feed, or chat thread, so
 * they stay stable across builds and safe to ship in the install dialog.
 *
 * Colours come from `src/lib/pwa/pwa-theme.json` (which mirrors globals.css),
 * so the install dialog previews the actual Hoplite Dark surface.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = resolve(__dirname, '..', '..');

const THEME = JSON.parse(readFileSync(resolve(WEB_ROOT, 'src/lib/pwa/pwa-theme.json'), 'utf8'));

export const COLORS = Object.freeze({
  ...THEME.palette,
  bg: THEME.palette.bg,
  panel: THEME.palette.bgElev2,
  elevated: THEME.palette.bgElev3,
  onBrand: '#FFFFFF',
});

/** Brand logo embedded as a data URI so each SVG stays self-contained. */
const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
  resolve(WEB_ROOT, 'public/brand/kestrel-logo.png'),
).toString('base64')}`;

export const MONO = 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace';
export const SANS = 'Inter, system-ui, -apple-system, Segoe UI, sans-serif';

export const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Raster logo in an SVG — sized to the 3:2 source aspect. */
export function logoImage(x, y, width, height) {
  return `<image href="${LOGO_DATA_URI}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
}

export function text(x, y, value, size, fill = COLORS.fg, weight = 500, anchor = 'start') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${MONO}" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
}

export function heading(x, y, value, size, fill = COLORS.fg, weight = 700, anchor = 'start') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${SANS}" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
}

export function rect(x, y, width, height, fill, radius = 2, stroke = 'none') {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}

export function line(x1, y1, x2, y2, stroke, width = 2, dash = '') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function path(d, stroke, width = 3, fill = 'none') {
  return `<path d="${d}" stroke="${stroke}" stroke-width="${width}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Wrap body markup in a full-size SVG canvas. */
export function canvas(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>
  ${body}
</svg>`;
}

/**
 * Rasterise one shot to PNG.
 *
 * @param {typeof import('sharp')} sharp
 * @param {{ file: string, width: number, height: number, svg: string }} shot
 * @param {{ force: boolean, outDir: string }} options
 * @returns {Promise<'written' | 'skipped'>}
 */
export async function writeShot(sharp, shot, options) {
  const output = resolve(options.outDir, shot.file);
  const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(options.outDir, { recursive: true });
  if (existsSync(output) && !options.force) return 'skipped';
  const png = await sharp(Buffer.from(shot.svg)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(output, png);
  // eslint-disable-next-line no-console
  console.log(`[generate-pwa-screenshots] wrote ${output} (${shot.width}x${shot.height})`);
  return 'written';
}
