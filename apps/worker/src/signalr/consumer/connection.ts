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

// BiQuote SignalR consumer. Holds a single persistent hub connection,
// subscribes to the active gold/forex symbols, and hands validated ticks
// to a caller-supplied `onTick` handler.
//
// The hub client itself is injected via the `buildConnection` factory so
// tests can stub `@microsoft/signalr` without monkey-patching modules. In
// production we pass in the real `HubConnectionBuilder` from the package.
//
// Reference: https://biquote.io/docs#websocket
//
// SignalR events we care about:
//   - "ReceiveTick" (server → client)         — every BiQuote tick
//   - "Subscribe(symbols[])" (client → server) — subscribe call
//   - "Unsubscribe(symbols[])"                  — symmetric unsubscribe
//
// Phase 8 PR-6 — feeds `live_ticks` (this PR). PR-7 wires the same `onTick`
// to the in-process 1m candle aggregator.

import { SYMBOLS } from '@kestrel/shared';

import { DEFAULT_RECONNECT_DELAYS, jitteredDelay } from '../reconnect.js';
import { isBiquoteSymbol, normalizeIncomingTick } from './ticks.js';
import type { ConsumerOptions, MinimalHubConnection } from './types.js';

export class SignalRConsumer {
  private readonly opts: ConsumerOptions;
  private connection: MinimalHubConnection | null = null;
  /** Symbols we've asked the hub to subscribe to; resent on reconnect. */
  private subscribedSymbols = new Set<string>();
  /** True after `start()` resolves and until `stop()` runs. */
  private started = false;
  /**
   * Phase 2 hardening §1 — manual reconnect state. Once SignalR's own
   * automatic reconnect schedule is exhausted, the SDK fires `onclose`
   * and stops trying. Without this loop the worker process keeps
   * running with no SignalR connection and tick ingestion is silently
   * dead until the next deploy or manual restart.
   */
  private stopping = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  /** Cap the manual rebuild backoff so we never sleep more than a minute. */
  private static readonly MAX_REBUILD_BACKOFF_MS = 60_000;

  constructor(opts: ConsumerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const initialSymbols = (this.opts.symbols ?? [...SYMBOLS]).filter(isBiquoteSymbol);
    for (const s of initialSymbols) this.subscribedSymbols.add(s);
    const symbols = Array.from(this.subscribedSymbols);

    const conn = this.opts.buildConnection({
      hubUrl: this.opts.hubUrl,
      reconnectDelaysMs: this.opts.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS,
    });
    this.connection = conn;

    conn.on('ReceiveTick', (...args: unknown[]) => {
      this.handleTick(args[0]);
    });

    conn.onreconnecting((err) => {
      this.opts.log.warn('signalr reconnecting', { err: err ? String(err) : undefined });
    });
    conn.onreconnected(() => {
      const current = Array.from(this.subscribedSymbols);
      this.opts.log.info('signalr reconnected — resubscribing', {
        symbols: current,
      });
      void this.subscribe(current);
    });
    conn.onclose((err) => {
      this.opts.log.error('signalr connection closed', {
        err: err ? String(err) : 'no error',
      });
      this.started = false;
      if (!this.stopping) this.scheduleReconnect();
    });

    this.opts.log.info('signalr starting', {
      hubUrl: this.opts.hubUrl,
      symbols,
    });
    await conn.start();
    try {
      await this.subscribe(symbols);
    } catch (err) {
      // A failed Subscribe must not orphan a started connection: rebuild()
      // nulls this.connection before the next attempt, and stop() is the
      // only path that can close it, so close it here before rethrowing.
      try {
        await conn.stop();
      } catch {
        // best-effort cleanup — the rebuild ladder continues regardless
      }
      this.connection = null;
      throw err;
    }
    this.started = true;
    this.opts.log.info('signalr subscribed', { symbols });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.connection) return;
    try {
      await this.unsubscribe(Array.from(this.subscribedSymbols));
    } catch (err) {
      this.opts.log.warn('signalr unsubscribe failed during stop', { err: String(err) });
    }
    try {
      await this.connection.stop();
    } catch (err) {
      this.opts.log.warn('signalr stop failed', { err: String(err) });
    }
    this.connection = null;
    this.started = false;
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const baseMs = Math.min(
      SignalRConsumer.MAX_REBUILD_BACKOFF_MS,
      2_000 * Math.pow(2, this.reconnectAttempt - 1),
    );
    const delay = jitteredDelay(baseMs);
    this.opts.log.warn('signalr scheduling manual rebuild', {
      attempt: this.reconnectAttempt,
      delayMs: Math.round(delay),
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.rebuild();
    }, delay);
    this.reconnectTimer.unref();
  }

  private async rebuild(): Promise<void> {
    if (this.stopping) return;
    this.connection = null;
    try {
      await this.start();
      this.opts.log.info('signalr manual rebuild succeeded', {
        attempts: this.reconnectAttempt,
      });
      this.reconnectAttempt = 0;
    } catch (err) {
      this.opts.log.error('signalr manual rebuild failed', { err: String(err) });
      this.scheduleReconnect();
    }
  }

  async subscribe(symbols: string[]): Promise<void> {
    if (!this.connection || symbols.length === 0) return;
    await this.connection.invoke('Subscribe', symbols);
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    if (!this.connection || symbols.length === 0) return;
    await this.connection.invoke('Unsubscribe', symbols);
  }

  /**
   * Update active subscriptions dynamically.
   */
  async updateSubscriptions(added: string[], removed: string[]): Promise<void> {
    const toAdd = added.filter((s) => isBiquoteSymbol(s) && !this.subscribedSymbols.has(s));
    const toRemove = removed.filter((s) => this.subscribedSymbols.has(s));

    if (toAdd.length > 0) {
      for (const s of toAdd) this.subscribedSymbols.add(s);
      await this.subscribe(toAdd);
    }
    if (toRemove.length > 0) {
      for (const s of toRemove) this.subscribedSymbols.delete(s);
      await this.unsubscribe(toRemove);
    }
  }

  /**
   * Handle one raw tick. Validates against BiquoteSignalRTickSchema,
   * drops if the symbol isn't in the canonical catalog, normalises to a
   * LiveTick-shaped DTO, and dispatches to `onTick`.
   *
   * Exposed for tests; SignalR itself drives this via `on('ReceiveTick', ...)`.
   */
  handleTick(raw: unknown): void {
    const normalized = normalizeIncomingTick(raw, this.opts.log);
    if (!normalized) return;

    try {
      this.opts.onTick(normalized);
      this.opts.onActivity?.();
    } catch (err) {
      this._droppedTicks += 1;
      this.opts.log.error('onTick handler threw — tick dropped', {
        err: String(err),
        droppedTicks: this._droppedTicks,
      });
    }
  }

  /** Test introspection. */
  isStarted(): boolean {
    return this.started;
  }

  /** H4 fix — count of ticks dropped due to onTick handler errors. */
  private _droppedTicks = 0;

  /** Return the current dropped-tick count for health monitoring. */
  droppedTicks(): number {
    return this._droppedTicks;
  }
}
