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

// SPDX-License-Identifier: Apache-2.0

// Delivery logging, budgets, and rule labels (DEC-05 split from delivery.ts).
// The catalog logger and timeout constants are created exactly once here so
// every channel adapter shares one instance.

import type { AlertRule } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { alertRuleRegistry } from '../rule-registry';

export function describeRule(rule: AlertRule): string {
  return alertRuleRegistry.get(rule.type).describe(rule);
}

export const alog = createCategorizedLogger('ai', { component: 'alerts-delivery' });
export const EXTERNAL_DELIVERY_TIMEOUT_MS = 30_000;
/**
 * Triggered price alerts rank as `warning`: above `info` chatter, below the
 * `critical` tier that punches through quiet hours by default.
 */
export const ALERT_NOISE_SEVERITY = 'warning' as const;
export const TELEGRAM_API = 'https://api.telegram.org';
