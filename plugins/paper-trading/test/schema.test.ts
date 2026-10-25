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

// Schema guarantees for the Paper Trading broker.

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { paperAccounts, paperFills, paperOrders, paperPositions } from '../src/db/tables';

describe('paper trading schema', () => {
  it('prefixes every table and forces tenant RLS', () => {
    for (const table of [paperAccounts, paperPositions, paperOrders, paperFills]) {
      const config = getTableConfig(table);
      expect(config.name.startsWith('plg_paper_trading_')).toBe(true);
      expect(config.enableRLS).toBe(true);
      expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
      expect(config.columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['id', 'tenant_id', 'user_id', 'created_at', 'updated_at']),
      );
    }
  });

  it('keeps the account mode and risk controls explicit', () => {
    const config = getTableConfig(paperAccounts);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'mode',
        'initial_balance',
        'balance',
        'leverage',
        'risk_per_trade_pct',
        'status',
      ]),
    );
  });

  it('stores protection and lifecycle fields on positions', () => {
    const config = getTableConfig(paperPositions);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'account_id',
        'side',
        'status',
        'quantity',
        'initial_quantity',
        'entry_price',
        'stop_loss',
        'take_profit',
        'trailing_stop_distance',
        'trailing_stop_price',
        'break_even_at_r',
        'initial_risk_amount',
        'close_reason',
        'journal_entry_id',
      ]),
    );
  });

  it('links orders and fills to the account ledger', () => {
    for (const table of [paperOrders, paperFills]) {
      const config = getTableConfig(table);
      expect(config.columns.map((column) => column.name)).toContain('account_id');
    }
    expect(getTableConfig(paperFills).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['position_id', 'order_id', 'kind', 'pnl', 'fees']),
    );
  });
});
