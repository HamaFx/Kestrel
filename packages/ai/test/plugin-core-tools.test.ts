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
// plugin, so `buildPluginCoreToolCatalog` must fall back to the canonical
// Mastra registrations for metadata. This keeps the Custom Agents picker and
// its sanitizer offering `get_price` and friends; execution resolution is
// unchanged because `coreToolsFor` already resolves native-first.

import { pluginHost } from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

// Cross-package test import: the sanitizer consumes the catalog this module
// publishes, so this asserts the picker contract end-to-end.
// eslint-disable-next-line no-restricted-imports -- cross-package test, mirrors ai-data.integration.test.ts
import { sanitizeTools } from '../../../plugins/custom-agents/src/services/agents/sanitizers';
// eslint-disable-next-line no-restricted-imports -- cross-package test, mirrors ai-data.integration.test.ts
import { DEFAULT_SETTINGS } from '../../../plugins/custom-agents/src/settings';
import { nativeCanonicalTools } from '../src/mastra-v2/tools/canonical';
import { buildPluginCoreToolCatalog, syncPluginCoreTools } from '../src/plugins/core-tools';

describe('plugin core-tool catalog (P2-01)', () => {
  beforeEach(() => {
    pluginHost.clear();
  });

  it('lists every native canonical tool with its canonical description', async () => {
    const catalog = await buildPluginCoreToolCatalog();
    const byName = new Map(catalog.map((tool) => [tool.name, tool]));

    for (const [name, native] of Object.entries(nativeCanonicalTools())) {
      const entry = byName.get(name);
      expect(entry, `missing core tool: ${name}`).toBeDefined();
      expect(entry?.description).toBe((native as { description?: string }).description);
      expect((entry?.description ?? '').length).toBeGreaterThan(0);
    }
  });

  it('lets the custom-agents sanitizer accept a native-only tool name', async () => {
    await syncPluginCoreTools(pluginHost);

    expect(pluginHost.getCoreTools().some((tool) => tool.name === 'get_price')).toBe(true);
    expect(sanitizeTools(['get_price', 'get_candles'], DEFAULT_SETTINGS, [])).toEqual([
      'get_price',
      'get_candles',
    ]);
  });
});
