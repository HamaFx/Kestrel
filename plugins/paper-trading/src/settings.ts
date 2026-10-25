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

// Per-user Paper Trading settings.

import { z } from 'zod';

export const PLUGIN_ID = 'paper-trading';

export const settingsSchema = z.object({
  defaultPersonalBalance: z
    .number()
    .min(100)
    .max(100_000_000)
    .default(100_000)
    .describe('Starting balance for the Personal Demo account'),
  defaultSandboxBalance: z
    .number()
    .min(100)
    .max(100_000_000)
    .default(50_000)
    .describe('Starting balance for the AI Agent Sandbox account'),
  defaultRiskPct: z
    .number()
    .min(0.01)
    .max(10)
    .default(1)
    .describe('Default risk per trade, % of equity'),
  maxRiskPct: z
    .number()
    .min(0.01)
    .max(20)
    .default(2)
    .describe('Hard cap on risk per trade, % of equity'),
  defaultLeverage: z
    .number()
    .min(1)
    .max(500)
    .default(30)
    .describe('Account leverage for margin checks'),
  maxOpenPositions: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe('Maximum concurrent open positions per account'),
  maxMarginUtilisationPct: z
    .number()
    .min(5)
    .max(100)
    .default(50)
    .describe('Maximum share of free margin a single order may use'),
  spreadPips: z
    .number()
    .min(0)
    .max(100)
    .default(2)
    .describe('Synthetic spread in pips when the feed returns mid-only quotes'),
  slippagePips: z
    .number()
    .min(0)
    .max(100)
    .default(0.5)
    .describe('Adverse slippage per market/stop fill, in pips'),
  commissionPerUnit: z
    .number()
    .min(0)
    .max(100)
    .default(0)
    .describe('Commission per lot/coin per side (account currency)'),
  requireStopLoss: z
    .boolean()
    .default(true)
    .describe('Reject orders that do not include a protective stop loss'),
  autoJournal: z
    .boolean()
    .default(true)
    .describe('Copy closed paper trades into the Trade Journal'),
});

export type PaperSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PaperSettings = settingsSchema.parse({});

export function normaliseSettings(raw: Readonly<Record<string, unknown>>): PaperSettings {
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const merged = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...raw });
  return merged.success ? merged.data : DEFAULT_SETTINGS;
}
