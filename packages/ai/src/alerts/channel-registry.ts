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

// P1-4 — Plugin-based alert channel registry.
//
// Replaces the closed `switch (channel)` in delivery.ts. Core channels
// (email, telegram, web-push) register here; plugin channels are adapted
// from `pluginHost` at delivery time so a plugin can add Discord/Slack/etc.
// without editing core code.

import type { Alert } from '@kestrel/shared';

import type { EvaluatorEnv, RuleReading } from './evaluator';

export interface AlertChannelDeliveryArgs {
  alert: Alert;
  reading: RuleReading;
  env: EvaluatorEnv;
  /** Lease acquired by the evaluator before invoking external providers. */
  claimAt?: Date | undefined;
}

export interface AlertChannelDeliveryResult {
  ok: boolean;
  message?: string | undefined;
}

export interface AlertChannelPlugin {
  id: string;
  label: string;
  /**
   * Deliver one alert. The caller marks the alert fired only when `ok` is
   * true, so a channel must not mutate alert state itself.
   */
  deliver: (args: AlertChannelDeliveryArgs) => Promise<AlertChannelDeliveryResult>;
}

export class AlertChannelRegistry {
  private readonly channels = new Map<string, AlertChannelPlugin>();

  register(channel: AlertChannelPlugin): void {
    this.channels.set(channel.id, channel);
  }

  get(id: string): AlertChannelPlugin | undefined {
    return this.channels.get(id);
  }

  has(id: string): boolean {
    return this.channels.has(id);
  }

  list(): AlertChannelPlugin[] {
    return [...this.channels.values()];
  }

  clear(): void {
    this.channels.clear();
  }
}

/** Process-wide core channel registry. */
export const alertChannelRegistry = new AlertChannelRegistry();
