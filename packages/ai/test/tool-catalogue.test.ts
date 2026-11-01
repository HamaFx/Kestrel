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

// P2-01 removal: the seven natively-migrated tools have no legacy registry
// plugin, so `buildToolCatalogue` must fall back to the canonical Mastra
// registrations for the real description instead of '(no description)'.

import { describe, expect, it, vi } from 'vitest';

import { nativeCanonicalTools } from '../src/mastra-v2/tools/canonical';
import { buildToolCatalogue } from '../src/models/catalogue';

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getToolStats: vi.fn(async () => []) };
});

describe('buildToolCatalogue (P2-01)', () => {
  it('describes every native canonical tool with its canonical description', async () => {
    const entries = await buildToolCatalogue();
    const byName = new Map<string, (typeof entries)[number]>(
      entries.map((entry) => [entry.name, entry]),
    );

    for (const [name, native] of Object.entries(nativeCanonicalTools())) {
      const entry = byName.get(name);
      expect(entry, `missing catalogue row: ${name}`).toBeDefined();
      expect(entry?.description).toBe((native as { description?: string }).description);
      expect(entry?.description).not.toBe('(no description)');
      expect((entry?.description ?? '').length).toBeGreaterThan(0);
    }
  });
});
