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

// Schema guarantees for the Backtesting Lab. The migration is hand-written,
// so these assertions keep the Drizzle tables and the SQL contract aligned.

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { backtestRuns, backtestStrategies } from '../src/db/tables';

describe('backtesting schema', () => {
  it('prefixes both tables and forces tenant RLS', () => {
    for (const table of [backtestRuns, backtestStrategies]) {
      const config = getTableConfig(table);
      expect(config.name.startsWith('plg_backtesting_')).toBe(true);
      expect(config.enableRLS).toBe(true);
      expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
      expect(config.columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['id', 'tenant_id', 'user_id', 'created_at', 'updated_at']),
      );
    }
  });

  it('stores the scorecard, curve, trades and exact source', () => {
    const config = getTableConfig(backtestRuns);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'source',
        'engine_version',
        'metrics',
        'equity_curve',
        'trades',
        'rejected_signals',
        'warnings',
      ]),
    );
  });

  it('keeps the strategy slug scoped to the user', () => {
    const config = getTableConfig(backtestStrategies);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['slug', 'favorite', 'params', 'tags']),
    );
  });
});
