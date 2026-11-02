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

// P1-3 — Plugin-based alert rule type registry.
//
// Replaces the switch(rule.type) statements in spec.ts and evaluator.ts
// with a single registry. Adding a new alert rule type now means registering
// it here — no existing code changes (OCP).
//
// Pattern mirrors IndicatorRegistry (packages/indicators/src/registry.ts).

import { describeAlertRule, type AlertRule } from '@kestrel/shared';

import { CrossingSpec, LevelSpec, type AlertSpec } from './spec';

type AlertRuleType = AlertRule['type'];
type RuleOf<T extends AlertRuleType> = Extract<AlertRule, { type: T }>;

// --- Plugin definition --------------------------------------------------

/**
 * A registration for one rule type. `T` ties the factory and describer to
 * the matching member of the `AlertRule` union, so neither needs a cast or
 * an `any` annotation.
 */
interface AlertRuleTypePlugin<T extends AlertRuleType = AlertRuleType> {
  /** The rule type discriminator (e.g. 'priceCross', 'candleClose', 'indicatorCross'). */
  type: T;
  /** Factory: rule → evaluable AlertSpec. */
  specFactory: (rule: RuleOf<T>) => AlertSpec;
  /** Human-readable label for this rule (e.g. "XAUUSD price above 2650"). */
  describe: (rule: RuleOf<T>) => string;
  /** Short label for catalogues / documentation. */
  label: string;
}

/** Type-erased registration held by the registry. */
interface RegisteredAlertRuleType {
  type: AlertRuleType;
  label: string;
  specFactory: (rule: AlertRule) => AlertSpec;
  describe: (rule: AlertRule) => string;
}

function ruleOfType<T extends AlertRuleType>(rule: AlertRule, type: T): RuleOf<T> {
  if (rule.type !== type) {
    throw new Error(`Alert rule type mismatch: expected "${type}", got "${rule.type}".`);
  }
  return rule as RuleOf<T>;
}

// --- Registry ------------------------------------------------------------

/**
 * Plugin-based alert rule type registry.
 *
 * OCP benefit: adding a rule type means registering it here —
 * no switch statements to update in spec.ts or evaluator.ts.
 */
class AlertRuleRegistry {
  private plugins = new Map<AlertRuleType, RegisteredAlertRuleType>();

  register<T extends AlertRuleType>(plugin: AlertRuleTypePlugin<T>): void {
    this.plugins.set(plugin.type, {
      type: plugin.type,
      label: plugin.label,
      specFactory: (rule) => plugin.specFactory(ruleOfType(rule, plugin.type)),
      describe: (rule) => plugin.describe(ruleOfType(rule, plugin.type)),
    });
  }

  get(type: AlertRuleType): RegisteredAlertRuleType {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(
        `Unknown alert rule type: "${type}". Registered types: ${this.listTypes().join(', ')}. ` +
          `Add it via alertRuleRegistry.register().`,
      );
    }
    return plugin;
  }

  has(type: AlertRuleType): boolean {
    return this.plugins.has(type);
  }

  listTypes(): AlertRuleType[] {
    return [...this.plugins.keys()];
  }
}

/** Global singleton. */
export const alertRuleRegistry = new AlertRuleRegistry();

/** Human-readable label for a rule, delegated to its registered type plugin. */
export function describeRule(rule: AlertRule): string {
  return describeAlertRule(rule);
}

// --- Registration (self-contained) --------------------------------------
//
// All alert rule types register themselves here. Adding a new type
// means adding a registration entry — no switch statement changes.

// priceCross — fires when live mid crosses a price level.
alertRuleRegistry.register({
  type: 'priceCross',
  label: 'Price Cross',
  specFactory: (rule) => new LevelSpec(rule.direction, rule.level),
  describe: (rule) => `${rule.symbol} price ${rule.direction} ${rule.level}`,
});

// candleClose — fires when the most recent closed candle's close crosses a level.
alertRuleRegistry.register({
  type: 'candleClose',
  label: 'Candle Close',
  specFactory: (rule) => new LevelSpec(rule.direction, rule.level),
  describe: (rule) =>
    `${rule.symbol} ${rule.tf.toUpperCase()} close ${rule.direction} ${rule.level}`,
});

// indicatorCross — fires when an indicator value transitions through a level
// (true crossing semantics, not level semantics).
alertRuleRegistry.register({
  type: 'indicatorCross',
  label: 'Indicator Cross',
  specFactory: (rule) => new CrossingSpec(rule.direction, rule.level),
  describe: (rule) =>
    `${rule.symbol} ${rule.tf.toUpperCase()} ${rule.indicator.toUpperCase()} ${rule.direction} ${rule.level}`,
});
