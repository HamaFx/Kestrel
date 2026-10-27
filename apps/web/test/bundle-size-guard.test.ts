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

import { describe, expect, it } from 'vitest';

import { matchesPattern, selectLimit } from '../scripts/bundle-size-guard.mjs';

describe('bundle-size-guard matcher', () => {
  it('matches exact paths', () => {
    expect(matchesPattern('main-abc.js', 'main-abc.js')).toBe(true);
    expect(matchesPattern('main-abc.js', 'main-def.js')).toBe(false);
  });

  it('matches single-segment wildcards', () => {
    expect(matchesPattern('app/dashboard-abc.js', 'app/*.js')).toBe(true);
    expect(matchesPattern('app/nested/page-abc.js', 'app/*.js')).toBe(false);
  });

  it('matches zero or more segments with **', () => {
    expect(matchesPattern('foo.js', '**/*.js')).toBe(true);
    expect(matchesPattern('a/foo.js', '**/*.js')).toBe(true);
    expect(matchesPattern('a/b/c/foo.js', '**/*.js')).toBe(true);
    expect(matchesPattern('a/b/c/foo.css', '**/*.js')).toBe(false);
  });

  it('matches chat route patterns', () => {
    expect(matchesPattern('app/(app)/chat/page-abc.js', 'app/(app)/chat/**/*.js')).toBe(true);
    expect(matchesPattern('app/(app)/chat/[threadId]/page-abc.js', 'app/(app)/chat/**/*.js')).toBe(
      true,
    );
    expect(matchesPattern('app/(app)/settings/page-abc.js', 'app/(app)/chat/**/*.js')).toBe(false);
  });

  it('matches nested ** patterns', () => {
    expect(matchesPattern('app/a/b/c.js', 'app/**/*.js')).toBe(true);
    expect(matchesPattern('app/a.js', 'app/**/*.js')).toBe(true);
    expect(matchesPattern('pages/a.js', 'app/**/*.js')).toBe(false);
  });

  it('does not over-match extra trailing segments', () => {
    expect(matchesPattern('app/page.js', 'app/*.js')).toBe(true);
    expect(matchesPattern('app/foo/page.js', 'app/*.js')).toBe(false);
  });
});

describe('bundle-size-guard limit selection', () => {
  // Config order is the contract: most-specific first, first match wins.
  const limits = [
    { pattern: 'app/(app)/chat/**/*.js', maxBytes: 900_000, description: 'deliberately larger' },
    { pattern: 'app/**/*.js', maxBytes: 768_000 },
    { pattern: '**/*.js', maxBytes: 870_000 },
  ];

  it('takes the first matching pattern, not the smallest budget', () => {
    // Regression: the guard used to sort matches by budget and pick the
    // smallest, so a specific pattern asking for a *larger* allowance than the
    // fallback was silently overridden.
    expect(selectLimit(limits, 'app/(app)/chat/page-abc.js')).toBe(limits[0]);
    expect(selectLimit(limits, 'app/(app)/dashboard/page-abc.js')).toBe(limits[1]);
    expect(selectLimit(limits, 'vendor-abc.js')).toBe(limits[2]);
  });

  it('returns undefined when nothing matches', () => {
    expect(selectLimit([{ pattern: 'app/**/*.js', maxBytes: 1 }], 'vendor.js')).toBeUndefined();
  });
});
