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

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('service worker', () => {
  it('precaches the expected shell URLs', () => {
    const precache = JSON.parse(readFileSync('public/sw-precache.json', 'utf8')) as unknown[];
    expect(precache).toContain('/chat');
    expect(precache).toContain('/offline');
    expect(precache).toContain('/manifest.webmanifest');
  });

  it('declares bypass prefixes and cache-first strategies', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    expect(sw).toContain('BYPASS_PREFIXES');
    expect(sw).toContain("'/api/chat'");
    expect(sw).toContain('function cacheFirst');
    expect(sw).toContain('function handleNavigation');
  });
});
