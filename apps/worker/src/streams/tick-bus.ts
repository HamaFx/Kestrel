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

// Plugin TickBus.
//
// Every validated BiQuote/Binance tick is fanned out to plugin subscribers
// asynchronously. A plugin bug (throw, rejected promise, slow handler) must
// never interrupt core tick ingestion, candle aggregation, or persistence:
// each subscriber is isolated behind an error boundary with its own bounded
// in-flight queue.

import {
  pluginHost,
  type PluginInstalledUser,
  type PluginTick,
  type PluginTickContext,
  type PluginTickSubscriber,
  type RegisteredPluginTickSubscriber,
} from '@kestrel/plugin-sdk';

import type { Logger } from '../log.js';
import { loadInstalledPluginUsers } from '../scheduler/plugin-users.js';

const INSTALLED_USERS_TTL_MS = 30_000;
const MAX_IN_FLIGHT_PER_SUBSCRIBER = 100;

export interface TickBusOptions {
  log: Logger;
  /** Override the subscriber set (tests). Defaults to `pluginHost`. */
  subscribers?: readonly RegisteredPluginTickSubscriber[];
}

interface SubscriberState {
  inFlight: number;
  dropped: number;
}

export class TickBus {
  private readonly log: Logger;
  private readonly subscribers: readonly RegisteredPluginTickSubscriber[];
  private readonly abortController = new AbortController();
  private readonly states = new Map<string, SubscriberState>();
  private readonly userCache = new Map<
    string,
    { expiresAt: number; users: readonly PluginInstalledUser[] }
  >();
  private stopped = false;

  constructor(options: TickBusOptions) {
    this.log = options.log;
    this.subscribers = options.subscribers ?? pluginHost.getTickSubscribers();
    for (const subscriber of this.subscribers) {
      this.states.set(this.key(subscriber), { inFlight: 0, dropped: 0 });
    }
  }

  /** Publish one validated tick. Never throws and never awaits subscribers. */
  publish(tick: PluginTick): void {
    if (this.stopped || this.subscribers.length === 0) return;

    for (const subscriber of this.subscribers) {
      if (!this.accepts(subscriber, tick.symbol)) continue;

      const key = this.key(subscriber);
      const state = this.states.get(key);
      if (!state) continue;

      if (state.inFlight >= MAX_IN_FLIGHT_PER_SUBSCRIBER) {
        state.dropped += 1;
        if (state.dropped === 1 || state.dropped % 1_000 === 0) {
          this.log.warn('plugin tick subscriber is saturated; dropping ticks', {
            pluginId: subscriber.pluginId,
            subscriberId: subscriber.id,
            dropped: state.dropped,
          });
        }
        continue;
      }

      state.inFlight += 1;
      const ctx: PluginTickContext = {
        pluginId: subscriber.pluginId,
        log: this.log,
        signal: this.abortController.signal,
        getInstalledUsers: () => this.getInstalledUsers(subscriber.pluginId),
      };

      void Promise.resolve()
        .then(() => subscriber.handler(tick, ctx))
        .then(() => {})
        .catch((err: unknown) => {
          this.log.error('plugin tick subscriber failed', {
            pluginId: subscriber.pluginId,
            subscriberId: subscriber.id,
            symbol: tick.symbol,
            err: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          const current = this.states.get(key);
          if (current) current.inFlight = Math.max(0, current.inFlight - 1);
        });
    }
  }

  /** Users with this plugin installed and enabled; cached per plugin for 30s. */
  async getInstalledUsers(pluginId: string): Promise<readonly PluginInstalledUser[]> {
    const now = Date.now();
    const cached = this.userCache.get(pluginId);
    if (cached && cached.expiresAt > now) return cached.users;

    const users = await loadInstalledPluginUsers(pluginId, this.log);
    this.userCache.set(pluginId, { expiresAt: now + INSTALLED_USERS_TTL_MS, users });
    return users;
  }

  /** Stop accepting ticks and signal in-flight handlers to abort. */
  stop(): void {
    this.stopped = true;
    this.abortController.abort(new Error('worker shutting down'));
  }

  private accepts(subscriber: PluginTickSubscriber, symbol: string): boolean {
    return (
      !subscriber.symbols || subscriber.symbols.length === 0 || subscriber.symbols.includes(symbol)
    );
  }

  private key(subscriber: PluginTickSubscriber & { pluginId: string }): string {
    return `${subscriber.pluginId}:${subscriber.id}`;
  }
}

/** Build a TickBus from the process plugin host. */
export function createTickBus(log: Logger): TickBus {
  return new TickBus({ log: log.with({ module: 'plugin-tick-bus' }) });
}
