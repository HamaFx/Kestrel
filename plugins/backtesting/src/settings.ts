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

// Per-user Backtesting Lab settings, rendered automatically by the Plugin
// Store's Zod form.

import { z } from 'zod';

export const PLUGIN_ID = 'backtesting';

export const settingsSchema = z.object({
  defaultInitialBalance: z
    .number()
    .min(100)
    .max(10_000_000)
    .default(10_000)
    .describe('Default starting balance for a new backtest'),
  defaultRiskPct: z
    .number()
    .min(0.01)
    .max(10)
    .default(1)
    .describe('Default risk per trade, as a percentage of equity'),
  defaultSpreadPips: z
    .number()
    .min(0)
    .max(100)
    .default(2)
    .describe('Default full spread in pips, applied on every fill'),
  defaultSlippagePips: z
    .number()
    .min(0)
    .max(100)
    .default(0.5)
    .describe('Default adverse slippage per fill, in pips'),
  commissionPerUnit: z
    .number()
    .min(0)
    .max(100)
    .default(0)
    .describe('Commission per lot/coin per side (account currency)'),
  leverage: z
    .number()
    .min(1)
    .max(500)
    .default(10)
    .describe('Maximum notional exposure as a multiple of equity'),
  maxCandles: z
    .number()
    .int()
    .min(100)
    .max(5000)
    .default(1000)
    .describe('Default number of candles per run'),
  keepRuns: z
    .number()
    .int()
    .min(5)
    .max(500)
    .default(50)
    .describe('How many recent runs to keep before pruning'),
});

export type BacktestSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: BacktestSettings = settingsSchema.parse({});

/** Settings arrive as a decrypted `Record<string, unknown>` from the host. */
export function normaliseSettings(raw: Readonly<Record<string, unknown>>): BacktestSettings {
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const merged = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...raw });
  return merged.success ? merged.data : DEFAULT_SETTINGS;
}
