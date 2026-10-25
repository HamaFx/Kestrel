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

import { PluginUiRegistry } from '../src/ui';

function DummyPage() {
  return null;
}

describe('PluginUiRegistry', () => {
  it('filters nav items, widgets and commands by installed plugin ids', () => {
    const registry = new PluginUiRegistry();
    registry.register('alpha', {
      navItems: [{ href: '/plugins/alpha', label: 'Alpha' }],
      dashboardWidgets: [{ id: 'alpha-widget', title: 'Alpha', component: DummyPage }],
      slashCommands: [{ id: 'alpha', label: 'Alpha' }],
    });

    expect(registry.listNavItems([])).toHaveLength(0);
    expect(registry.listNavItems(['alpha'])).toHaveLength(1);
    expect(registry.listDashboardWidgets([])).toHaveLength(0);
    expect(registry.listDashboardWidgets(['alpha'])).toHaveLength(1);
    expect(registry.listSlashCommands(['alpha'])).toHaveLength(1);
  });

  it('resolves static and :param plugin pages', () => {
    const registry = new PluginUiRegistry();
    registry.register('alpha', {
      pages: [
        { path: '', component: DummyPage },
        { path: 'runs/:runId', component: DummyPage },
      ],
    });

    expect(registry.resolvePage('alpha', '')).toMatchObject({ params: {} });
    expect(registry.resolvePage('alpha', 'runs/42')?.params).toEqual({ runId: '42' });
    expect(registry.resolvePage('alpha', 'missing')).toBeNull();
  });

  it('rejects duplicate tool part registrations across plugins', () => {
    const registry = new PluginUiRegistry();
    registry.register('alpha', {
      chatToolParts: { alpha_tool: { component: DummyPage } },
    });
    expect(() =>
      registry.register('beta', {
        chatToolParts: { alpha_tool: { component: DummyPage } },
      }),
    ).toThrow(/already registered/);
  });
});
