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

import { pluginHost } from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enrichPacketForUser } from '../src/plugins/enrichers';

const runtime = vi.hoisted(() => ({
  getInstalledPluginRuntime: vi.fn(),
  pluginSettingsFor: vi.fn(() => ({})),
  createPluginExecutionContext: vi.fn(() => ({
    settings: {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })),
}));

vi.mock('../src/plugins/runtime', () => runtime);

const plugin = {
  manifest: {
    id: 'paper-trading',
    name: 'Paper Trading',
    version: '1.0.0',
    tagline: 'test',
    description: 'test',
    category: 'trading-execution' as const,
    iconName: 'IconWallet',
    installMode: 'instant' as const,
  },
  packetEnrichers: [
    {
      id: 'positions',
      enrich: async ({ symbol }: { symbol: string }) => ({ symbol, count: 2 }),
    },
  ],
};

describe('plugin packet enrichment', () => {
  beforeEach(() => {
    pluginHost.clear();
    runtime.getInstalledPluginRuntime.mockResolvedValue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      installedPluginIds: ['paper-trading'],
      plugins: [{ pluginId: 'paper-trading', enabled: true, settings: {} }],
    });
    runtime.createPluginExecutionContext.mockReturnValue({
      settings: {},
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
  });

  it('merges installed-plugin enrichment into a copy of the packet', async () => {
    pluginHost.register(plugin);
    const base = { symbol: 'XAUUSD', status: 'ready', price: 2400 };
    const enriched = await enrichPacketForUser(base, 'user-1');
    expect(enriched.price).toBe(2400);
    expect(enriched.pluginEnrichment).toEqual({
      'paper-trading:positions': { symbol: 'XAUUSD', count: 2 },
    });
    expect(base).not.toHaveProperty('pluginEnrichment');
  });

  it('does not run enrichers from uninstalled plugins', async () => {
    pluginHost.register(plugin);
    runtime.getInstalledPluginRuntime.mockResolvedValue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      installedPluginIds: [],
      plugins: [],
    });
    const base = { symbol: 'XAUUSD', status: 'ready' };
    expect(await enrichPacketForUser(base, 'user-1')).toEqual(base);
  });
});
