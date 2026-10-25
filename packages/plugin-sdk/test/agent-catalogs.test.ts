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

import { PluginHost } from '../src/host';
import { definePlugin } from '../src/index';
import type { KestrelPlugin, PluginUserAgentCatalog } from '../src/types';

function catalog(id: string): PluginUserAgentCatalog {
  return {
    id,
    listAgents: async () => [],
    getAgent: async () => null,
  };
}

function makePlugin(id: string, overrides: Partial<KestrelPlugin> = {}): KestrelPlugin {
  return definePlugin({
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      tagline: id,
      description: id,
      category: 'agents-skills',
      iconName: 'IconUsersGroup',
      installMode: 'instant',
    },
    ...overrides,
  });
}

describe('PluginHost agent catalogs', () => {
  it('registers catalogs and resolves them only for installed plugins', () => {
    const host = new PluginHost();
    host.register(makePlugin('agents-a', { agentCatalogs: [catalog('main')] }));
    host.register(makePlugin('agents-b', { agentCatalogs: [catalog('main')] }));

    expect(host.resolveAgentCatalogsForUser(['agents-a'])).toHaveLength(1);
    expect(host.resolveAgentCatalogsForUser(['agents-a'])[0]?.pluginId).toBe('agents-a');
    expect(host.resolveAgentCatalogsForUser(['agents-b'])[0]?.pluginId).toBe('agents-b');
    expect(host.resolveAgentCatalogsForUser([])).toHaveLength(0);
    expect(host.resolveAgentCatalogsForUser(['unknown'])).toHaveLength(0);
  });

  it('rejects duplicate catalog ids inside one plugin and malformed ids', () => {
    const host = new PluginHost();
    host.register(makePlugin('agents-a', { agentCatalogs: [catalog('main')] }));
    expect(() =>
      host.register(makePlugin('agents-b', { agentCatalogs: [catalog('main'), catalog('main')] })),
    ).toThrow(/duplicate agent catalog/);
    expect(() =>
      host.register(makePlugin('agents-c', { agentCatalogs: [catalog('Not_Kebab')] })),
    ).toThrow(/kebab-case/);
  });

  it('requires listAgents and getAgent', () => {
    const host = new PluginHost();
    expect(() =>
      host.register(
        makePlugin('agents-a', {
          agentCatalogs: [{ id: 'broken', listAgents: async () => [] } as never],
        }),
      ),
    ).toThrow(/getAgent/);
  });

  it('publishes and clears the safe core tool catalog', () => {
    const host = new PluginHost();
    host.setCoreTools([
      { name: 'get_price', description: 'Price', access: 'read-only', group: 'market-data' },
    ]);
    expect(host.getCoreTools()).toHaveLength(1);
    expect(host.getCoreTools()[0]?.name).toBe('get_price');
    host.clear();
    expect(host.getCoreTools()).toHaveLength(0);
  });
});
