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
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
    expect(buildId).toMatch(/^[0-9a-f]{7}-\d+$/);

    expect(existsSync(envFile)).toBe(true);
    expect(readFileSync(envFile, 'utf8')).toContain(`NEXT_PUBLIC_BUILD_ID=${buildId}`);
  });

  it('generate-sw writes precache manifest and stamps sw.js with the build id', () => {
    execSync('node scripts/generate-sw.mjs', { cwd: process.cwd() });

    const buildId = readFileSync(buildIdFile, 'utf8').trim();

    expect(existsSync(precacheFile)).toBe(true);
    const precache = JSON.parse(readFileSync(precacheFile, 'utf8')) as unknown[];
    expect(precache).toContain('/chat');

    expect(existsSync(swFile)).toBe(true);
    const sw = readFileSync(swFile, 'utf8');
    expect(sw).toContain(`kestrel-shell-v${buildId}`);
  });

  it('generate-sw fails the build when the template is missing', () => {
    const templateFile = resolve(process.cwd(), 'scripts/sw.template.js');
    const backup = `${templateFile}.bak`;
    renameSync(templateFile, backup);

    try {
      expect(() => execSync('node scripts/generate-sw.mjs', { cwd: process.cwd() })).toThrow();
    } finally {
      renameSync(backup, templateFile);
    }
  });
});
