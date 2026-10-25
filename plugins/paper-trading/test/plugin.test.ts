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

import { quotesFromTick, sizePosition } from '../src/domain';
import plugin from '../src/index';
import { DEFAULT_SETTINGS, normaliseSettings } from '../src/settings';

describe('paper trading plugin', () => {
  it('registers dual-mode capabilities', () => {
    const host = new PluginHost();
    host.register(plugin);

    expect(host.getPlugin('paper-trading')).toBeDefined();
    const tools = host.resolveToolsForUser(['paper-trading']);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'paper_cancel_order',
        'paper_close_position',
        'paper_deploy_strategy',
        'paper_get_accounts',
        'paper_get_position',
        'paper_list_orders',
        'paper_list_positions',
        'paper_list_strategy_runs',
        'paper_modify_position',
        'paper_place_order',
        'paper_reset_account',
        'paper_update_account',
      ].sort(),
    );
    expect(host.resolveToolsForUser([])).toHaveLength(0);
    expect(host.resolveSkillsForUser(['paper-trading'])).toHaveLength(1);
    expect(plugin.tickSubscribers).toHaveLength(1);
    expect(plugin.packetEnrichers).toHaveLength(1);
    expect(plugin.jobs).toHaveLength(2);
    expect(plugin.jobs?.every((job) => job.schedule === '* * * * *')).toBe(true);
  });

  it('gates personal orders and leaves risk-reducing actions unblocked', () => {
    const host = new PluginHost();
    host.register(plugin);
    expect(host.getTool('paper_place_order')?.access).toBe('write');
    // The dynamic function is reported conservatively by the host.
    expect(host.requiresConfirmationForTool('paper_place_order')).toBe(true);
    expect(host.requiresConfirmationForTool('paper_close_position')).toBe(false);
    expect(host.requiresConfirmationForTool('paper_cancel_order')).toBe(false);
    expect(host.requiresConfirmationForTool('paper_reset_account')).toBe(true);
  });

  it('normalises settings and keeps the risk cap coherent', () => {
    expect(normaliseSettings({})).toEqual(DEFAULT_SETTINGS);
    const custom = normaliseSettings({ maxRiskPct: 5, defaultRiskPct: 3 });
    expect(custom.maxRiskPct).toBe(5);
    expect(custom.defaultRiskPct).toBe(3);
    expect(custom.requireStopLoss).toBe(true);
  });

  it('sizes a 1% gold trade consistently with the domain rules', () => {
    const result = sizePosition({
      equity: 100_000,
      freeMargin: 100_000,
      leverage: 30,
      contractSize: 100,
      entryPrice: 2000,
      stopLoss: 1990,
      riskPct: 1,
      requestedQuantity: null,
      maxRiskPct: 2,
      maxMarginUtilisationPct: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quantity).toBeCloseTo(1, 6);
  });

  it('synthesises a spread when a feed returns a mid-only quote', () => {
    const quotes = quotesFromTick(
      { symbol: 'XAUUSD', bid: 2000, ask: 2000, mid: 2000, ts: 1 },
      0.2,
    );
    expect(quotes.ask - quotes.bid).toBeCloseTo(0.2, 6);
  });
});
