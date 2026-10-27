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

// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0

import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveBuildId } from '../scripts/set-build-id.mjs';

const buildIdFile = resolve(process.cwd(), '.build-id');
const envFile = resolve(process.cwd(), '.env.production.local');
const swFile = resolve(process.cwd(), 'public/sw.js');
const precacheFile = resolve(process.cwd(), 'public/sw-precache.json');

describe('build scripts', () => {
  let originalSw: Buffer | null = null;
  let originalPrecache: Buffer | null = null;

  it('uses the single build wrapper without lifecycle duplicates', async () => {
    const pkg = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.build).toBe('node scripts/build.mjs');
    expect(pkg.scripts?.prebuild).toBeUndefined();
    expect(pkg.scripts?.postbuild).toBeUndefined();
  });

  beforeAll(() => {
    if (existsSync(swFile)) {
      originalSw = readFileSync(swFile);
    }
    if (existsSync(precacheFile)) {
      originalPrecache = readFileSync(precacheFile);
    }
  });

  afterAll(() => {
    for (const f of [buildIdFile, envFile]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        // ignore
      }
    }
    if (originalSw) {
      writeFileSync(swFile, originalSw);
    } else {
      try {
        if (existsSync(swFile)) unlinkSync(swFile);
      } catch {
        // best effort cleanup
      }
    }
    if (originalPrecache) {
      writeFileSync(precacheFile, originalPrecache);
    } else {
      try {
        if (existsSync(precacheFile)) unlinkSync(precacheFile);
      } catch {
        // best effort cleanup
      }
    }
  });

  it('set-build-id writes .build-id and .env.production.local', () => {
    execSync('node scripts/set-build-id.mjs', { cwd: process.cwd() });

    expect(existsSync(buildIdFile)).toBe(true);
    const buildId = readFileSync(buildIdFile, 'utf8').trim();
    expect(buildId).toMatch(/^[0-9a-f]{7}(?:-[0-9a-f]{8})?$/);

    expect(existsSync(envFile)).toBe(true);
    expect(readFileSync(envFile, 'utf8')).toContain(`NEXT_PUBLIC_BUILD_ID=${buildId}`);
  });

  it('generate-sw writes precache manifest and stamps sw.js with the build id', () => {
    execSync('node scripts/generate-sw.mjs', { cwd: process.cwd() });

    const buildId = readFileSync(buildIdFile, 'utf8').trim();

    expect(existsSync(precacheFile)).toBe(true);
    const precache = JSON.parse(readFileSync(precacheFile, 'utf8')) as unknown[];
    expect(precache).toContain('/offline');
    // Auth-gated documents must never be precached (shared-device privacy).
    expect(precache).not.toContain('/chat');

    expect(existsSync(swFile)).toBe(true);
    const sw = readFileSync(swFile, 'utf8');
    expect(sw).toContain(`kestrel-shell-v${buildId}`);
  });

  it('honours an explicit KESTREL_BUILD_ID stamp (Docker build arg)', () => {
    // Container builds have no .git, so without an explicit stamp every image
    // would share the `local00` id and the service worker would never update.
    const previous = process.env.KESTREL_BUILD_ID;
    process.env.KESTREL_BUILD_ID = 'abc1234';
    try {
      expect(resolveBuildId()).toBe('abc1234');
      // An explicit programmatic stamp still wins over the environment.
      expect(resolveBuildId({ buildId: 'override0' })).toBe('override0');
      // Blank values fall through to the git-derived id instead of stamping ''.
      process.env.KESTREL_BUILD_ID = '  ';
      expect(resolveBuildId()).not.toBe('  ');
    } finally {
      if (previous === undefined) delete process.env.KESTREL_BUILD_ID;
      else process.env.KESTREL_BUILD_ID = previous;
    }
  });

  it('generate-sw fails the build when the template is missing', () => {
    // Run a throwaway copy of the generator in an isolated fake web root so
    // the shared scripts/sw.template.js is never renamed — service-worker
    // tests run in parallel workers and read that path.
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kestrel-sw-missing-'));
    try {
      mkdirSync(join(tmpRoot, 'scripts'), { recursive: true });
      const generator = join(tmpRoot, 'scripts', 'generate-sw.mjs');
      copyFileSync(resolve(process.cwd(), 'scripts/generate-sw.mjs'), generator);

      expect(() => execSync(`node ${JSON.stringify(generator)}`, { cwd: tmpRoot })).toThrow();
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
