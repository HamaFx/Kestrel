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

// Public plugin contract — market-data extensions: alert indicators and
// analysis-packet enrichers.

import type { z } from 'zod';

import type { PluginLogger } from './core';

export interface PluginIndicatorRegistration {
  /** Indicator kind accepted in alert specs, e.g. `supertrend`. */
  kind: string;
  description: string;
  paramsSchema: z.ZodType<Record<string, number>>;
  compute: (candles: readonly unknown[], params: Record<string, number>) => unknown[];
}

export interface PluginPacketEnricher {
  id: string;
  /** Cheap capability gate (e.g. only enrich FX symbols). */
  supportsSymbol?: (symbol: string) => boolean;
  enrich: (args: {
    userId: string;
    tenantId: string;
    symbol: string;
    settings: Readonly<Record<string, unknown>>;
    log: PluginLogger;
    signal?: AbortSignal;
  }) => Promise<Record<string, unknown> | null>;
}
