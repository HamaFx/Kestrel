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
 * generate-icons.mjs
 *
 * Generates the complete Kestrel home-screen asset set in
 * `apps/web/public/icons/` (plus `public/favicon.ico`) from the brand logo.
 * Idempotent: by default it skips targets that already exist on disk; pass
 * `--force` to regenerate.
 *
 * Targets:
 *   - icon-192/512/1024.png            (purpose: any; 1024 is what iOS 17.2+
 *                                       picks for the home screen)
 *   - icon-maskable-512.png            (Android adaptive safe zone)
 *   - apple-touch-icon-180/167/152.png (iPhone / iPad Pro / iPad)
 *   - favicon.ico                      (16/32/48 PNG-in-ICO container)
 *   - apple-splash-<w>x<h>.png         (one per device + orientation, from
 *                                       src/lib/pwa/splash-devices.json)
 *
 * Colours come from `src/lib/pwa/pwa-theme.json` so the icon plate, the
 * manifest chrome and the splash background all match `--color-bg`.
 *
 * `sharp` is loaded dynamically so this script never crashes a `next build`
 * when the dep is not present yet — it just logs a hint and exits 0.
 *
 * Usage:
 *   node scripts/generate-icons.mjs              # write missing files only
 *   node scripts/generate-icons.mjs --force      # overwrite all targets
 *
 * Requirements: 5.7
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const ICONS_DIR = resolve(WEB_ROOT, 'public/icons');
const PUBLIC_DIR = resolve(WEB_ROOT, 'public');

/** Brand background — mirrors `--color-bg` in globals.css. */
const THEME = JSON.parse(readFileSync(resolve(WEB_ROOT, 'src/lib/pwa/pwa-theme.json'), 'utf8'));
const BRAND_BG = THEME.background;

/** Apple launch-image matrix (shared with src/lib/pwa/splash-links.ts). */
const SPLASH_DEVICES = JSON.parse(
  readFileSync(resolve(WEB_ROOT, 'src/lib/pwa/splash-devices.json'), 'utf8'),
).devices;

/** Source logo — uploaded kestrel bird mark (1536x1024), used as-is.
 * The reversible two-tone design reads on the dark icon background: white
 * strokes show on dark, black strokes show on light. */
const LOGO_PATH = resolve(WEB_ROOT, 'public/brand/kestrel-logo.png');

/**
 * @typedef {Object} IconTarget
 * @property {string} file
 * @property {number} width
 * @property {number} height
 * @property {'icon' | 'maskable' | 'splash'} kind
 * @property {boolean} [palette] PNG-8 output (flat artwork → much smaller)
 */

/** @type {readonly IconTarget[]} */
const TARGETS = Object.freeze([
  { file: 'icon-192.png', width: 192, height: 192, kind: 'icon' },
  { file: 'icon-512.png', width: 512, height: 512, kind: 'icon' },
  { file: 'icon-1024.png', width: 1024, height: 1024, kind: 'icon' },
  { file: 'icon-maskable-512.png', width: 512, height: 512, kind: 'maskable' },
  { file: 'apple-touch-icon-180.png', width: 180, height: 180, kind: 'icon' },
  { file: 'apple-touch-icon-167.png', width: 167, height: 167, kind: 'icon' },
  { file: 'apple-touch-icon-152.png', width: 152, height: 152, kind: 'icon' },
]);

/** @type {readonly IconTarget[]} */
const SPLASH_TARGETS = Object.freeze(
  SPLASH_DEVICES.flatMap((/** @type {{widthPt:number,heightPt:number,scale:number}} */ d) => {
    const w = d.widthPt * d.scale;
    const h = d.heightPt * d.scale;
    return [
      { file: `apple-splash-${w}x${h}.png`, width: w, height: h, kind: 'splash', palette: true },
      { file: `apple-splash-${h}x${w}.png`, width: h, height: w, kind: 'splash', palette: true },
    ];
  }),
);

/** Hex string → sharp create() background. */
function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    alpha: 1,
  };
}

const BRAND_RGB = hexToRgb(BRAND_BG);

/**
 * Composite the logo onto the brand background for a target.
 * The logo is 3:2, so it is sized by width relative to the short side:
 *   - icon / apple-touch: 78% (fills the square, leaves breathing room)
 *   - maskable:           60% (inside the iOS/Android safe zone)
 *   - splash:             26% (small mark on a flat background)
 *
 * @param {IconTarget} t
 * @param {typeof import('sharp')} sharp
 * @returns {Promise<Buffer>} PNG buffer
 */
async function buildPng(t, sharp) {
  const { width, height, kind } = t;
  const short = Math.min(width, height);
  const ratio = kind === 'maskable' ? 0.6 : kind === 'splash' ? 0.26 : 0.78;
  const logoW = Math.round(short * ratio);
  // Derive height from the live source dimensions so the aspect stays exact.
  const meta = await sharp(LOGO_PATH).metadata();
  const logoAspect = (meta.width ?? 1536) / (meta.height ?? 1024);
  const logoH = Math.round(logoW / logoAspect);

  const logo = await sharp(LOGO_PATH).resize(logoW, logoH, { fit: 'fill' }).png().toBuffer();

  return sharp({
    create: { width, height, channels: 4, background: BRAND_RGB },
  })
    .composite([
      {
        input: logo,
        left: Math.round((width - logoW) / 2),
        top: Math.round((height - logoH) / 2),
      },
    ])
    .png({
      compressionLevel: 9,
      // Splashes are flat colour + one raster mark: a small palette keeps
      // ~30 device images from bloating the repository.
      ...(t.palette ? { palette: true, colours: 64 } : {}),
    })
    .toBuffer();
}

/**
 * Build a multi-size `favicon.ico` from PNG payloads.
 * ICO entries may carry PNG data (Vista+); browsers request /favicon.ico
 * directly, and the service worker precaches it.
 *
 * @param {Array<{ size: number, png: Buffer }>} entries
 * @returns {Buffer}
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const base = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
    directory.writeUInt8(0, base + 2); // palette size
    directory.writeUInt8(0, base + 3); // reserved
    directory.writeUInt16LE(1, base + 4); // colour planes
    directory.writeUInt16LE(32, base + 6); // bits per pixel
    directory.writeUInt32LE(entry.png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

/** @param {typeof import('sharp')} sharp */
async function buildFavicon(sharp) {
  const entries = [];
  for (const size of [16, 32, 48]) {
    const png = await buildPng({ file: '', width: size, height: size, kind: 'icon' }, sharp);
    entries.push({ size, png });
  }
  return buildIco(entries);
}

/**
 * Write a target unless it already exists (and `force` is off).
 *
 * @param {string} file absolute path
 * @param {() => Promise<Buffer>} build
 * @param {boolean} force
 * @returns {Promise<'written' | 'skipped'>}
 */
async function writeTarget(file, build, force) {
  if (existsSync(file) && !force) return 'skipped';
  writeFileSync(file, await build());
  console.log(`[generate-icons] wrote ${file}`);
  return 'written';
}

async function main() {
  const force = process.argv.includes('--force');

  /** @type {typeof import('sharp')} */
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      '[generate-icons] `sharp` is not installed. Run ' +
        '`pnpm --filter @kestrel/web add -D sharp` then re-run this script. ' +
        'Skipping icon generation.',
    );
    return;
  }

  mkdirSync(ICONS_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  const track = (result) => {
    if (result === 'written') written += 1;
    else skipped += 1;
  };

  for (const t of [...TARGETS, ...SPLASH_TARGETS]) {
    track(await writeTarget(resolve(ICONS_DIR, t.file), () => buildPng(t, sharp), force));
  }

  track(await writeTarget(resolve(PUBLIC_DIR, 'favicon.ico'), () => buildFavicon(sharp), force));

  console.log(
    `[generate-icons] done — ${written} written, ${skipped} skipped` +
      `${force ? ' (force)' : ''}; ${SPLASH_TARGETS.length} launch images in matrix`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[generate-icons] failed:', err);
  process.exit(1);
});
