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
 * Generate the PWA showcase screenshots referenced by `app/manifest.ts`.
 *
 * The artwork is intentionally static: it remains stable during builds and
 * never captures a user's account, market feed, or chat. Both orientations are
 * required — Chrome only unlocks the richer desktop install dialog when the
 * manifest ships a `form_factor: 'wide'` screenshot.
 *
 * Compositions live in `scripts/pwa-screens/`:
 *   - portrait.mjs → 1080x1920 (narrow, phones)
 *   - wide.mjs     → 1920x1080 (wide, desktop install dialog)
 *
 * Usage:
 *   pnpm --filter @kestrel/web generate:screenshots
 *   pnpm --filter @kestrel/web generate:screenshots --force
 */
import { resolve } from 'node:path';

import { WEB_ROOT, writeShot } from './pwa-screens/kit.mjs';
import { PORTRAIT_SHOTS } from './pwa-screens/portrait.mjs';
import { WIDE_SHOTS } from './pwa-screens/wide.mjs';

const OUT_DIR = resolve(WEB_ROOT, 'public/screenshots');

const SHOTS = [...PORTRAIT_SHOTS, ...WIDE_SHOTS];

async function main() {
  const force = process.argv.includes('--force');
  const { default: sharp } = await import('sharp');

  let written = 0;
  let skipped = 0;
  for (const shot of SHOTS) {
    const result = await writeShot(sharp, shot, { force, outDir: OUT_DIR });
    if (result === 'written') written += 1;
    else {
      skipped += 1;
      console.log(`[generate-pwa-screenshots] skipped ${resolve(OUT_DIR, shot.file)}`);
    }
  }

  const narrow = SHOTS.filter((shot) => shot.formFactor === 'narrow').length;
  const wide = SHOTS.filter((shot) => shot.formFactor === 'wide').length;
  console.log(
    `[generate-pwa-screenshots] done — ${written} written, ${skipped} skipped ` +
      `(${narrow} narrow, ${wide} wide)`,
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[generate-pwa-screenshots] failed:', error);
  process.exitCode = 1;
});
