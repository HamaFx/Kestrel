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

// Wire types for the BiQuote SignalR consumer: the normalised tick DTO,
// the minimal hub-connection surface the consumer needs, and the injected
// connection factory / consumer options.

import type { Symbol } from '@kestrel/shared';

import type { Logger } from '../../log.js';

export interface NormalizedTick {
  symbol: Symbol;
  bid: number;
  ask: number;
  /** mid = (bid + ask) / 2 — pre-computed so consumers don't recompute. */
  mid: number;
  /** ms epoch UTC. */
  ts: number;
  /** Stable string. 'biquote-signalr' or 'binance-ws'. */
  source: 'biquote-signalr' | 'binance-ws';
  /** Optional kline high when tick originates from a kline stream. */
  high?: number;
  /** Optional kline low when tick originates from a kline stream. */
  low?: number;
  /** Optional kline cumulative volume when tick originates from a kline stream. */
  volume?: number;
}

export interface MinimalHubConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke(method: string, ...args: unknown[]): Promise<unknown>;
  on(method: string, handler: (...args: unknown[]) => void): void;
  off(method: string, handler?: (...args: unknown[]) => void): void;
  onreconnecting(handler: (err?: unknown) => void): void;
  onreconnected(handler: (id?: string) => void): void;
  onclose(handler: (err?: unknown) => void): void;
}

export interface BuildConnectionArgs {
  hubUrl: string;
  reconnectDelaysMs?: number[];
}

export type BuildConnection = (args: BuildConnectionArgs) => MinimalHubConnection;

export interface ConsumerOptions {
  hubUrl: string;
  /** Symbols to subscribe to. Defaults to all SUPPORTED_SYMBOLS. */
  symbols?: Symbol[];
  /** Called for every validated tick. Errors thrown here are logged + swallowed. */
  onTick: (tick: NormalizedTick) => void;
  /** Optional liveness signal — fires when a tick arrives (for healthchecks). */
  onActivity?: () => void;
  /** Override the SignalR connection factory (used by tests). */
  buildConnection: BuildConnection;
  log: Logger;
  reconnectDelaysMs?: number[];
}
