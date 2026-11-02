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

// P0-3 — Plugin-based indicator registry (replaces the switch(kind) dispatch).
//
// Each indicator registers itself with a name, params schema, and a
// standardized compute function. Adding a new indicator requires only
// implementing a new file, importing it here, and registering it — no
// existing dispatch code changes. This mirrors the AlertRuleRegistry pattern
// from packages/ai/src/alerts/rule-registry.ts.
//
// Used by the `/api/market/indicators` route handler and the
// `get_indicators` AI tool so they share a single source of truth
// for parameter parsing and output shape.
//
// P2 consolidation: `indicator-registry.ts` and `registry.ts` used to hold
// the class and the compute helpers separately, which made the import cycle
// implicit. One module now owns the registry, the registrations, and the
// compute entry points.

import {
  IndicatorKindSchema,
  type Candle,
  type IndicatorKind,
  type IndicatorResult,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';
import { z } from 'zod';

import { atr } from './atr';
import { bollinger } from './bollinger';
import { macd } from './macd';
import { ema, sma } from './moving-averages';
import { pivotsAligned } from './pivots';
import { rsi } from './rsi';

// --- Plugin definition --------------------------------------------------

/**
 * An indicator plugin registered in the registry.
 * The `compute` function receives candles + params (already parsed
 * and validated by the registry) and returns the raw value array.
 * The registry wraps the result into the standard IndicatorResult shape.
 */
export interface IndicatorPlugin {
  /** Unique indicator kind (e.g. 'sma', 'ema', 'rsi'). */
  kind: IndicatorKind;
  /** Zod schema for params. Used by parseIndicatorParams(). */
  paramsSchema: z.ZodType;
  /**
   * Compute the indicator values from candles + parsed params.
   * Returns the raw value array — the registry wraps it into
   * `IndicatorResult` with the standard shape.
   */
  compute: (candles: Candle[], params: Record<string, number>) => unknown[];
  /** Human-readable description for catalogues / documentation. */
  description: string;
}

// --- Registry ------------------------------------------------------------

/**
 * Plugin-based indicator registry.
 *
 * Usage:
 * ```ts
 * import { indicatorRegistry } from './registry';
 *
 * // In each indicator file (self-registration):
 * indicatorRegistry.register({
 *   kind: 'sma',
 *   paramsSchema: PeriodOnly.default({ period: 20 }),
 *   compute: (candles, params) => sma(candles, params.period),
 *   description: 'Simple Moving Average',
 * });
 *
 * // In computeIndicator():
 * const plugin = indicatorRegistry.get('sma');
 * const values = plugin.compute(candles, parsedParams);
 * ```
 *
 * OCP benefit: adding an indicator means registering it —
 * no existing code changes.
 */
export class IndicatorRegistry {
  private plugins = new Map<IndicatorKind, IndicatorPlugin>();

  /**
   * Register an indicator plugin. Idempotent — registering
   * the same kind twice overwrites.
   */
  register(plugin: IndicatorPlugin): void {
    this.plugins.set(plugin.kind, plugin);
  }

  /**
   * Get a registered indicator plugin by kind.
   * Throws if the kind is not registered.
   */
  get(kind: IndicatorKind): IndicatorPlugin {
    const plugin = this.plugins.get(kind);
    if (!plugin) {
      throw new Error(
        `Unknown indicator kind: "${kind}". Registered kinds: ${this.listKinds().join(', ')}. ` +
          `Add it via indicatorRegistry.register() in the indicator's file and import it in the barrel.`,
      );
    }
    return plugin;
  }

  /**
   * Check if an indicator kind is registered.
   */
  has(kind: IndicatorKind): boolean {
    return this.plugins.has(kind);
  }

  /**
   * List all registered indicator kinds.
   */
  listKinds(): IndicatorKind[] {
    return [...this.plugins.keys()];
  }

  /**
   * List all registered plugins.
   */
  listPlugins(): IndicatorPlugin[] {
    return [...this.plugins.values()];
  }
}

/** Global singleton — import this in indicator files to register. */
export const indicatorRegistry = new IndicatorRegistry();

// --- Per-kind parameter schemas ------------------------------------------

const PeriodOnly = z.object({ period: z.int().min(1).max(500) });

indicatorRegistry.register({
  kind: 'sma',
  paramsSchema: PeriodOnly.default({ period: 20 }),
  compute: (candles, params) => sma(candles, params.period!),
  description: 'Simple Moving Average',
});

indicatorRegistry.register({
  kind: 'ema',
  paramsSchema: PeriodOnly.default({ period: 20 }),
  compute: (candles, params) => ema(candles, params.period!),
  description: 'Exponential Moving Average',
});

indicatorRegistry.register({
  kind: 'rsi',
  paramsSchema: PeriodOnly.default({ period: 14 }),
  compute: (candles, params) => rsi(candles, params.period!),
  description: 'Relative Strength Index (0-100)',
});

indicatorRegistry.register({
  kind: 'atr',
  paramsSchema: PeriodOnly.default({ period: 14 }),
  compute: (candles, params) => atr(candles, params.period!),
  description: 'Average True Range',
});

indicatorRegistry.register({
  kind: 'macd',
  paramsSchema: z
    .object({
      fast: z.int().min(1).max(200).default(12),
      slow: z.int().min(1).max(500).default(26),
      signal: z.int().min(1).max(200).default(9),
    })
    .default({ fast: 12, slow: 26, signal: 9 }),
  compute: (candles, params) =>
    macd(candles, params.fast!, params.slow!, params.signal!).map((p) => ({
      macd: p.macd,
      signal: p.signal,
      hist: p.hist,
    })),
  description: 'Moving Average Convergence Divergence (12/26/9)',
});

indicatorRegistry.register({
  kind: 'bollinger',
  paramsSchema: z
    .object({
      period: z.int().min(2).max(500).default(20),
      multiplier: z.number().min(0.1).max(10).default(2),
    })
    .default({ period: 20, multiplier: 2 }),
  compute: (candles, params) =>
    bollinger(candles, params.period!, params.multiplier!).map((p) => ({
      upper: p.upper,
      middle: p.middle,
      lower: p.lower,
    })),
  description: 'Bollinger Bands (20, 2)',
});

indicatorRegistry.register({
  kind: 'pivots',
  paramsSchema: z.object({}).default({}),
  compute: (candles, _params) =>
    pivotsAligned(candles).map((p) =>
      p === null
        ? null
        : {
            pp: p.pp,
            r1: p.r1,
            r2: p.r2,
            r3: p.r3,
            s1: p.s1,
            s2: p.s2,
            s3: p.s3,
          },
    ),
  description: 'Classic Floor Trader Pivots (PP, R1-R3, S1-S3)',
});

// --- Compute -------------------------------------------------------------

export interface ComputeArgs {
  symbol: Symbol;
  tf: Timeframe;
  kind: IndicatorKind;
  params: Record<string, unknown>;
  candles: Candle[];
}

/**
 * Parse and validate indicator params using the plugin's registered schema.
 * Backward-compatible — same signature as before P0-3.
 */
export function parseIndicatorParams(
  kind: IndicatorKind,
  raw: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const plugin = indicatorRegistry.get(kind);
  return plugin.paramsSchema.parse(raw) as Record<string, string | number | boolean>;
}

/**
 * Compute an indicator using the plugin registry.
 *
 * P0-3: Delegates to `indicatorRegistry.get(kind).compute()` instead of
 * a switch statement. Adding a new indicator now means registering it —
 * no existing code changes (OCP).
 */
export function computeIndicator(args: ComputeArgs): IndicatorResult {
  const { symbol, tf, kind, candles } = args;
  const params = parseIndicatorParams(IndicatorKindSchema.parse(kind), args.params);
  const fetchedAt = Date.now();

  const plugin = indicatorRegistry.get(kind);
  // Values are typed as unknown[] in the plugin interface to accommodate
  // the variety of indicator return types (number[], MacdPoint[], etc.).
  // The runtime value matches the expected IndicatorResult shape.
  const values = plugin.compute(
    candles,
    params as Record<string, number>,
  ) as IndicatorResult['values'];

  return { symbol, tf, kind, params, values, fetchedAt };
}
