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

import { z } from 'zod';

import { SymbolSchema } from '../symbols';
import { TimeframeSchema } from '../timeframes';

/**
 * Core delivery channels. Plugin channels are additional kebab-case ids
 * registered on `pluginHost` (e.g. `discord`), so the persisted shape is an
 * open string validated structurally here and resolved at delivery time.
 */
export const CORE_ALERT_CHANNELS = ['email', 'telegram', 'web-push'] as const;
export type CoreAlertChannel = (typeof CORE_ALERT_CHANNELS)[number];
export type AlertChannel = CoreAlertChannel | (string & {});

export const AlertChannelSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
    'channel must be a kebab-case id (e.g. "email", "web-push", "discord")',
  );

const PriceCrossRule = z.object({
  type: z.literal('priceCross'),
  symbol: SymbolSchema,
  level: z.number(),
  direction: z.enum(['above', 'below']),
});

const CandleCloseRule = z.object({
  type: z.literal('candleClose'),
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  level: z.number(),
  direction: z.enum(['above', 'below']),
});

const IndicatorCrossRule = z.object({
  type: z.literal('indicatorCross'),
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /**
   * Strict spec format: `<kind>` or `<kind>:<n>(,n)(,n)`.
   * The stored kind is validated structurally here; the evaluator then
   * checks it against `indicatorRegistry` so core and plugin indicators are
   * both addressable without a shared-package import cycle.
   */
  indicator: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]*(?::[0-9]+(?:,[0-9]+){0,2})?$/i,
      'indicator must match `<kind>` or `<kind>:n[,n[,n]]`',
    ),
  level: z.number(),
  direction: z.enum(['above', 'below']),
  /**
   * Latest observed indicator value from the previous evaluation tick.
   * Cross detection requires a baseline:
   *
   *   - direction "above" fires iff `prev < level AND curr >= level`
   *   - direction "below" fires iff `prev > level AND curr <= level`
   *
   * On the first tick `previousValue === null`, so the alert never fires
   * immediately on creation when the indicator already sits past the
   * threshold. The evaluator writes the current sample back as the new
   * baseline whenever it doesn't fire.
   */
  previousValue: z.number().nullable().optional(),
});

export const AlertRuleSchema = z.discriminatedUnion('type', [
  PriceCrossRule,
  CandleCloseRule,
  IndicatorCrossRule,
]);
export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const AlertSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).default(['email']),
  /** Human-readable note shown in the UI / notification body. */
  note: z.string().nullable(),
  active: z.boolean().default(true),
  /** Set once when fired; one-shot alerts go inactive after firing. */
  firedAt: z.int().nullable(),
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 17. When the alert last
   * fired, in epoch ms. Used by the cron as the snooze baseline:
   * a re-fire is eligible only when `now >= lastFiredAt + snoozeHours`.
   * Null = never fired.
   */
  lastFiredAt: z.int().nullable().optional(),
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 17. Snooze window in hours
   * (0..168). 0 = one-shot (legacy behavior). Values > 0 cause the
   * alert to re-arm `snoozeHours` after firing.
   */
  snoozeHours: z.int().min(0).max(168).default(0),
  createdAt: z.int(),
});
export type Alert = z.infer<typeof AlertSchema>;
