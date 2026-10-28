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
 * `apps/web/public/icons/` (plus `public/favicon.ico`) from the vector brand
 * mark, `public/brand/kestrel-falcon.svg`. Idempotent: by default it skips
 * targets that already exist on disk; pass `--force` to regenerate.
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
 * Colours come from `src/lib/pwa/pwa-theme.json` so the icon plate, the brand
 * glow, the manifest chrome and the splash background all match `--color-bg`
 * and `--color-brand`.
 *
 * The launcher targets (icon / maskable) composite a soft brand-red glow
 * behind the mark; the splash images and the favicon frames are a bare mark on
 * a flat plate. Both are what the approved reference set in `public/icons/`
 * shows — see MARK_BOX_RATIO and GLOW below.
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

/** Source mark — the vector falcon. Rendering the SVG directly (rather than
 * downscaling a raster logo) is what keeps the thin feather blades crisp and
 * the pupil sharp at every icon size. */
const MARK_PATH = resolve(WEB_ROOT, 'public/brand/kestrel-falcon.svg');

/** sharp rasterises an SVG's 256-unit viewBox as 256px at 72 DPI, so the
 * density needed for an N-pixel render is `N * MARK_DPI / MARK_VIEWBOX`. */
const MARK_VIEWBOX = 256;
const MARK_DPI = 72;

/**
 * The mark is rendered into a square box sized to this fraction of the icon's
 * short side. The falcon's visible ink sits inside that box with its own
 * margins (it spans ~79% x ~86% of the viewBox), so the box is always larger
 * than the bird you see.
 *
 * These three numbers are measured from the approved reference set already in
 * `public/icons/` — they reproduce those files, and are what the Android/iOS
 * safe-zone percentages were retuned to when the mark changed. They are not
 * free parameters: changing one changes every generated asset.
 */
const MARK_BOX_RATIO = Object.freeze({
  icon: 0.7227,
  maskable: 0.5625,
  splash: 0.2275,
  // Favicons have no home-screen safe zone to respect, so the mark runs
  // larger there — it is the only thing legible at 16px.
  favicon: 0.75,
});

/**
 * Brand glow — a brand-red disc centred on the falcon's pupil and Gaussian
 * blurred, composited behind the mark.
 *
 * Every value is a fraction of the short side, except the anchor which is
 * relative to the mark's box (the value below is the pupil's centroid measured
 * from the vector mark itself). Because the anchor is mark-relative and the
 * radius is plate-relative, the glow lands identically on every size.
 *
 * `KINDS` excludes `splash`: a glow behind a mark that small on a full-screen
 * launch image reads as a smudge, so splashes take the bare mark, exactly as
 * the reference set does.
 */
const GLOW = Object.freeze({
  radius: 0.185,
  sigma: 0.075,
  alpha: 0.104,
  anchorX: 0.59885,
  anchorY: 0.40718,
  KINDS: Object.freeze(['icon', 'maskable']),
});

/**
 * @typedef {Object} IconTarget
 * @property {string} file
 * @property {number} width
 * @property {number} height
 * @property {'icon' | 'maskable' | 'splash' | 'favicon'} kind
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

const PLATE_RGB = hexToRgb(BRAND_BG);

/** Brand accent — the glow tint, from the same theme JSON. */
const GLOW_RGB = hexToRgb(THEME.palette.brand);

/**
 * Render the brand mark from the vector source at `box` px square.
 *
 * @param {number} box
 * @param {typeof import('sharp')} sharp
 * @returns {Promise<Buffer>} PNG buffer with alpha
 */
async function renderMark(box, sharp) {
  const size = Math.max(1, Math.round(box));
  const density = Math.max(1, Math.round((size * MARK_DPI) / MARK_VIEWBOX));
  return sharp(MARK_PATH, { density })
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();
}

/**
 * Build the brand glow layer for a target.
 *
 * The colour channels are filled edge-to-edge with the brand red *before*
 * blurring, so the blur only ever redistributes alpha — it can never smear
 * dark pixels into the halo and the tint stays exact.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} short
 * @param {number} markBox
 * @param {typeof import('sharp')} sharp
 * @returns {Promise<Buffer>} PNG buffer with alpha
 */
async function buildGlow(width, height, short, markBox, sharp) {
  const radius = GLOW.radius * short;
  const cx = (width - markBox) / 2 + GLOW.anchorX * markBox;
  const cy = (height - markBox) / 2 + GLOW.anchorY * markBox;

  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = GLOW_RGB.r;
      raw[i + 1] = GLOW_RGB.g;
      raw[i + 2] = GLOW_RGB.b;
      raw[i + 3] = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius ? 255 : 0;
    }
  }

  const blurred = await sharp(raw, { raw: { width, height, channels: 4 } })
    .blur(GLOW.sigma * short)
    .raw()
    .toBuffer();

  for (let i = 3; i < blurred.length; i += 4) {
    blurred[i] = Math.round(blurred[i] * GLOW.alpha);
  }

  return sharp(blurred, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Composite the mark, and where the kind calls for it the brand glow, onto the
 * brand background for a target.
 *
 * @param {IconTarget} t
 * @param {typeof import('sharp')} sharp
 * @returns {Promise<Buffer>} PNG buffer
 */
async function buildPng(t, sharp) {
  const { width, height, kind } = t;
  const short = Math.min(width, height);
  const box = Math.max(1, Math.round(short * MARK_BOX_RATIO[kind]));
  const logo = await renderMark(box, sharp);

  /** @type {import('sharp').OverlayOptions[]} */
  const layers = [];

  if (GLOW.KINDS.includes(kind)) {
    layers.push({ input: await buildGlow(width, height, short, box, sharp), left: 0, top: 0 });
  }

  layers.push({
    input: logo,
    left: Math.round((width - box) / 2),
    top: Math.round((height - box) / 2),
  });

  return sharp({
    create: { width, height, channels: 4, background: PLATE_RGB },
  })
    .composite(layers)
    .png({
      compressionLevel: 9,
      // Splashes are flat colour + one vector mark: a small palette keeps
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
    // `favicon` carries no glow: at these sizes a halo is invisible and only
    // muddies the bird. This matches the shipped frames in `public/favicon.ico`.
    const png = await buildPng({ file: '', width: size, height: size, kind: 'favicon' }, sharp);
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
