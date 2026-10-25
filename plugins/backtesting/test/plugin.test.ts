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

import { PluginHost } from '@kestrel/plugin-sdk';
import { describe, expect, it } from 'vitest';

import plugin from '../src/index';
import { slugifyName } from '../src/schemas';
import { DEFAULT_SETTINGS, normaliseSettings } from '../src/settings';

describe('backtesting plugin', () => {
  it('registers its tools, skills, routes and UI-safe manifest', () => {
    const host = new PluginHost();
    host.register(plugin);

    expect(host.getPlugin('backtesting')).toBeDefined();
    const tools = host.resolveToolsForUser(['backtesting']);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'backtest_delete_strategy',
        'backtest_get_run',
        'backtest_knowledge_delete',
        'backtest_knowledge_list',
        'backtest_knowledge_read',
        'backtest_knowledge_save',
        'backtest_list_runs',
        'backtest_list_strategies',
        'backtest_read_strategy',
        'backtest_run_strategy',
        'backtest_save_strategy',
      ].sort(),
    );

    // Per-user visibility is fail-closed.
    expect(host.resolveToolsForUser([])).toHaveLength(0);
    expect(host.resolveToolsForUser(['telegram-bot'])).toHaveLength(0);

    expect(host.resolveSkillsForUser(['backtesting'])).toHaveLength(3);
    expect(Object.keys(plugin.apiRoutes ?? {}).length).toBeGreaterThan(0);
    expect(plugin.manifest.installMode).toBe('instant');
    expect(plugin.manifest.category).toBe('quant-research');
  });

  it('marks strategy execution read-only and library writes unconfirmed', () => {
    const host = new PluginHost();
    host.register(plugin);
    expect(host.getTool('backtest_run_strategy')?.access).toBe('read-only');
    expect(host.requiresConfirmationForTool('backtest_run_strategy')).toBe(false);
    expect(host.getTool('backtest_save_strategy')?.access).toBe('write');
    expect(host.requiresConfirmationForTool('backtest_save_strategy')).toBe(false);
    expect(host.isWriteTool('backtest_run_strategy')).toBe(false);
  });

  it('normalises settings and derives kebab-case slugs', () => {
    expect(normaliseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings({ defaultRiskPct: 2.5 }).defaultRiskPct).toBe(2.5);
    expect(slugifyName('London Sweep + FVG (15m)!')).toBe('london-sweep-fvg-15m');
  });
});
