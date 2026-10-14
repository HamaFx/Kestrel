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

// Binance WebSocket consumer — extends BaseWsConsumer for kline streams.

import WebSocket from 'ws';

import { BaseWsConsumer } from '../base-ws-consumer.js';
import type { Logger } from '../log.js';
import type { NormalizedTick } from '../signalr/consumer.js';

const DEFAULT_BINANCE_WS_BASE = 'wss://stream.binance.com:9443';
const PING_INTERVAL_MS = 3 * 60 * 1_000;
const MAX_EMPTY_MINUTES = 10;

export interface BinanceStreamConsumerOptions {
  symbols: string[];
  onTick: (tick: NormalizedTick) => void;
  onActivity?: () => void;
  log: Logger;
  wsUrl?: string | undefined;
}

export class BinanceStreamConsumer extends BaseWsConsumer {
  private lastMessageAt = 0;
  private symbols: string[];
  private readonly onTick: (tick: NormalizedTick) => void;
  private readonly wsBaseUrl: string;

  constructor(opts: BinanceStreamConsumerOptions) {
    super(opts.log, opts.onActivity);
    this.symbols = Array.from(new Set(opts.symbols));
    this.onTick = opts.onTick;
    this.wsBaseUrl = (opts.wsUrl ?? process.env.BINANCE_WS_URL ?? DEFAULT_BINANCE_WS_BASE).replace(
      /\/+$/,
      '',
    );
  }

  /** Update subscriptions dynamically. Reconnects only when the symbol set actually changes. */
  async updateSubscriptions(added: string[], removed: string[]): Promise<void> {
    const prevSet = new Set(this.symbols);
    const nextSet = new Set(this.symbols);
    for (const s of added) nextSet.add(s);
    for (const s of removed) nextSet.delete(s);

    const changed =
      prevSet.size !== nextSet.size || Array.from(nextSet).some((s) => !prevSet.has(s));
    if (!changed) return;

    this.symbols = Array.from(nextSet);

    if (!this.destroyed && this.ws) {
      this.reconnectImmediately('subscription update');
    }
  }

  // ── BaseWsConsumer overrides ────────────────────────────────────────

  protected override buildUrl(): string {
    if (this.symbols.length === 0) {
      this.log.info('binance ws skipping — no symbols configured');
      return '';
    }
    const streams = this.symbols.map((s) => `${s.toLowerCase()}@kline_1m`).join('/');
    return `${this.wsBaseUrl}/stream?streams=${streams}`;
  }

  protected override onOpen(): void {
    this.log.info('binance ws connected');
    this.lastMessageAt = Date.now();
  }

  protected override buildHeartbeatIntervalMs(): number {
    return PING_INTERVAL_MS;
  }

  protected override sendHeartbeat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping();
    }
    const idleSec = (Date.now() - this.lastMessageAt) / 1_000;
    if (idleSec > MAX_EMPTY_MINUTES * 60 && this.ws) {
      this.log.warn('binance ws idle — reconnecting', { idleSec });
      this.ws.close(4000, 'idle timeout');
    }
  }

  protected override handleMessage(data: WebSocket.Data): void {
    const now = Date.now();
    this.lastMessageAt = now;

    try {
      const msg = JSON.parse(data.toString());
      if (!msg || !msg.data) return;

      const k = msg.data;
      if (k.e !== 'kline' || !k.k) return;

      const candle = k.k;
      const symbol = k.s;
      const close = Number.parseFloat(candle.c);
      if (!Number.isFinite(close) || close <= 0) return;

      const high = Number.parseFloat(candle.h);
      const low = Number.parseFloat(candle.l);
      const volume = Number.parseFloat(candle.v);
      // Use Binance event timestamp `k.E` (actual observation time), never `candle.T`
      // (which is the minute-end close time up to 59,999ms in the future).
      const eventTs = typeof k.E === 'number' && Number.isFinite(k.E) && k.E > 0 ? k.E : now;

      const tick: NormalizedTick = {
        symbol,
        bid: close,
        ask: close,
        mid: close,
        ts: eventTs,
        source: 'binance-ws',
        ...(Number.isFinite(high) && high > 0 ? { high } : {}),
        ...(Number.isFinite(low) && low > 0 ? { low } : {}),
        ...(Number.isFinite(volume) && volume >= 0 ? { volume } : {}),
      };

      this.onTick(tick);
    } catch (err) {
      this.log.warn('binance ws parse error', { err: String(err) });
    }
  }
}
