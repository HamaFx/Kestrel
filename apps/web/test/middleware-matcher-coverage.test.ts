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

// SEC-1: Matcher-coverage test — ensure every withAuth-protected route
// is covered by the middleware matcher regex.

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = join(import.meta.dirname, '..', 'src');

/**
 * Derive the matcher and exclusion list from proxy.ts itself so this test
 * can never drift from the real security boundary. (The previous version
 * hand-copied the regex and was already missing `offline` and
 * `api/health/alerts`.)
 */
const PROXY_SOURCE = readFileSync(join(WEB_DIR, 'proxy.ts'), 'utf-8');

function extractMatcherLiteral(source: string): string {
  const match = source.match(/matcher:\s*\[\s*'((?:[^'\\]|\\.)+)'/);
  if (!match?.[1]) {
    throw new Error('Could not locate config.matcher in proxy.ts — update this test.');
  }
  return match[1];
}

/** The matcher literal escapes backslashes for the string; the regex sees one. */
function toRegexPattern(literal: string): string {
  const unescaped = literal.replace(/\\\\/g, '\\');
  // Next matches the pathname without a leading slash; anchor the full path
  // so the negative lookahead is evaluated from position 0 only.
  const withoutLeadingSlash = unescaped.startsWith('/') ? unescaped.slice(1) : unescaped;
  return `^${withoutLeadingSlash}$`;
}

const MATCHER_REGEX = new RegExp(toRegexPattern(extractMatcherLiteral(PROXY_SOURCE)));

/** Exclusion prefixes — parsed from the matcher's negative lookahead. */
const EXCLUDED_PREFIXES = (() => {
  const lookahead = extractMatcherLiteral(PROXY_SOURCE).match(/\(\?!([^)]*)\)/);
  if (!lookahead?.[1]) {
    throw new Error('Could not parse the matcher negative lookahead in proxy.ts.');
  }
  return lookahead[1]
    .split('|')
    .map((part) => part.replace(/\\\\/g, '\\').replace(/\\\./g, '.').replace(/\\/g, ''))
    .filter(Boolean);
})();

/** Find all route.ts files recursively. */
function findRouteFiles(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      result.push(...findRouteFiles(full));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      result.push(full);
    }
  }
  return result;
}

/** Check if a source file imports withAuth. */
function importsWithAuth(filePath: string): boolean {
  try {
    const src = readFileSync(filePath, 'utf-8');
    return /\bwithAuth\b/.test(src);
  } catch {
    return false;
  }
}

/** Map route.ts path to URL path. */
function filePathToUrlPath(filePath: string): string {
  const rel = relative(WEB_DIR, filePath);
  let urlPath = rel.replace(/^app\//, '/').replace(/\/route\.tsx?$/, '');
  urlPath = urlPath.replace(/\/\([^)]+\)/g, '');
  urlPath = urlPath.replace(/\/+/g, '/');
  return urlPath;
}

describe('middleware matcher coverage (SEC-1)', () => {
  const appDir = join(WEB_DIR, 'app');
  const allRoutes = findRouteFiles(appDir);
  const protectedRoutes = allRoutes.filter(importsWithAuth);

  it('finds at least some protected routes (sanity check)', () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
  });

  it('excludes the unauthenticated public health endpoints', () => {
    // These MUST stay outside the auth gate; if the exclusion is removed in
    // proxy.ts these assertions fail (the discovery used to be silent).
    for (const path of ['api/health/public', 'api/health/alerts', 'offline']) {
      expect(EXCLUDED_PREFIXES, `"${path}" must stay an intentional exclusion`).toContain(path);
      expect(MATCHER_REGEX.test(path)).toBe(false);
    }
  });

  for (const routeFile of protectedRoutes) {
    const urlPath = filePathToUrlPath(routeFile);
    const pathNoSlash = urlPath.replace(/^\//, '');
    const isExcluded = EXCLUDED_PREFIXES.some(
      (p) => pathNoSlash === p || pathNoSlash.startsWith(p + '/'),
    );

    if (isExcluded) continue;

    it(`matcher covers ${urlPath}`, () => {
      expect(
        MATCHER_REGEX.test(pathNoSlash),
        `Route "${urlPath}" is NOT covered by middleware matcher. ` +
          'Update proxy.ts config.matcher or add an exclusion.',
      ).toBe(true);
    });
  }
});
