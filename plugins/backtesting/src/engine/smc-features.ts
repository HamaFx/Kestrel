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

// Point-in-time Smart Money Concepts zones, sweeps, and structure levels.

import { computeStructure } from '@kestrel/indicators';
import type {
  Candle,
  FvgZone,
  LiquiditySweep,
  OrderBlock,
  StructureEvent,
  SwingPoint,
  Symbol,
  Timeframe,
} from '@kestrel/shared';

import { MAX_ACTIVE_ZONES, type FeatureMatrix } from './feature-types';

function nearestBullish<T>(
  zones: readonly T[],
  top: (zone: T) => number,
  bottom: (zone: T) => number,
  price: number,
): T | null {
  let best: T | null = null;
  let bestTop = Number.NEGATIVE_INFINITY;
  for (const zone of zones) {
    const topValue = top(zone);
    if (topValue <= price && topValue > bestTop && bottom(zone) <= price) {
      best = zone;
      bestTop = topValue;
    }
  }
  return best;
}

function nearestBearish<T>(
  zones: readonly T[],
  top: (zone: T) => number,
  bottom: (zone: T) => number,
  price: number,
): T | null {
  let best: T | null = null;
  let bestBottom = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const bottomValue = bottom(zone);
    if (bottomValue >= price && bottomValue < bestBottom && top(zone) >= price) {
      best = zone;
      bestBottom = bottomValue;
    }
  }
  return best;
}

/**
 * Build the point-in-time feature matrix.
 *
 * `candles` must be oldest-first and closed bars only. The function never
 * mutates the input.
 */

interface ActiveZone<T> {
  zone: T;
  visibleAt: number;
  strength: number;
}

export function applySmc(
  matrix: FeatureMatrix,
  candles: readonly Candle[],
  symbol: Symbol,
  timeframe: Timeframe,
): void {
  const structure = computeStructure({
    symbol,
    tf: timeframe,
    candles: [...candles],
    kinds: ['swings', 'bos_choch', 'fvg', 'order_blocks', 'liquidity'],
  });

  const swings = structure.swings ?? [];
  const events = structure.events ?? [];
  const fvgs = structure.fvg ?? [];
  const blocks = structure.orderBlocks ?? [];
  const sweeps = structure.liquidity ?? [];

  const swingByBar = new Map<number, SwingPoint[]>();
  for (const swing of swings) {
    const visibleAt = Math.min(candles.length - 1, swing.index + swing.lookback);
    const list = swingByBar.get(visibleAt) ?? [];
    list.push(swing);
    swingByBar.set(visibleAt, list);
  }

  const eventByBar = new Map<number, StructureEvent[]>();
  for (const event of events) {
    const list = eventByBar.get(event.brokenAt) ?? [];
    list.push(event);
    eventByBar.set(event.brokenAt, list);
  }

  const fvgByBar = new Map<number, FvgZone[]>();
  for (const fvg of fvgs) {
    const list = fvgByBar.get(fvg.endIndex) ?? [];
    list.push(fvg);
    fvgByBar.set(fvg.endIndex, list);
  }

  const blockByBar = new Map<number, OrderBlock[]>();
  for (const block of blocks) {
    // An order block is only knowable after its impulse bars close.
    const visibleAt = Math.min(candles.length - 1, block.index + 2);
    const list = blockByBar.get(visibleAt) ?? [];
    list.push(block);
    blockByBar.set(visibleAt, list);
  }

  const sweepByBar = new Map<number, LiquiditySweep[]>();
  for (const sweep of sweeps) {
    const list = sweepByBar.get(sweep.index) ?? [];
    list.push(sweep);
    sweepByBar.set(sweep.index, list);
  }

  const activeBullFvg: ActiveZone<FvgZone>[] = [];
  const activeBearFvg: ActiveZone<FvgZone>[] = [];
  const activeBullOb: ActiveZone<OrderBlock>[] = [];
  const activeBearOb: ActiveZone<OrderBlock>[] = [];

  let lastSwingHigh: { price: number; visibleAt: number } | null = null;
  let lastSwingLow: { price: number; visibleAt: number } | null = null;
  let lastSweep: LiquiditySweep | null = null;
  let lastEvent: StructureEvent | null = null;

  const smc = matrix.smc;

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i]!;

    for (const swing of swingByBar.get(i) ?? []) {
      if (swing.type === 'high') lastSwingHigh = { price: swing.price, visibleAt: i };
      else lastSwingLow = { price: swing.price, visibleAt: i };
    }
    for (const event of eventByBar.get(i) ?? []) lastEvent = event;
    for (const sweep of sweepByBar.get(i) ?? []) lastSweep = sweep;

    for (const zone of fvgByBar.get(i) ?? []) {
      const entry = { zone, visibleAt: i, strength: 0 };
      if (zone.side === 'bullish') activeBullFvg.push(entry);
      else activeBearFvg.push(entry);
    }
    for (const block of blockByBar.get(i) ?? []) {
      const entry = { zone: block, visibleAt: i, strength: block.strength ?? 0 };
      if (block.side === 'bullish') activeBullOb.push(entry);
      else activeBearOb.push(entry);
    }

    // Full mitigation removes a zone. A wick into (but not through) a zone
    // keeps it alive, which is what ICT "mitigation" means in practice.
    pruneZones(activeBullFvg, (zone) => candle.l <= zone.bottom);
    pruneZones(activeBearFvg, (zone) => candle.h >= zone.top);
    pruneZones(activeBullOb, (zone) => candle.c < zone.bottom);
    pruneZones(activeBearOb, (zone) => candle.c > zone.top);

    capZones(activeBullFvg);
    capZones(activeBearFvg);
    capZones(activeBullOb);
    capZones(activeBearOb);

    const bullFvg = nearestBullish(
      activeBullFvg.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );
    const bearFvg = nearestBearish(
      activeBearFvg.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );
    const bullOb = nearestBullish(
      activeBullOb.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );
    const bearOb = nearestBearish(
      activeBearOb.map((entry) => entry.zone),
      (zone) => zone.top,
      (zone) => zone.bottom,
      candle.c,
    );

    if (bullFvg) {
      smc.fvgBullTop[i] = bullFvg.top;
      smc.fvgBullBottom[i] = bullFvg.bottom;
      smc.fvgBullAge[i] = i - bullFvg.endIndex;
    }
    if (bearFvg) {
      smc.fvgBearTop[i] = bearFvg.top;
      smc.fvgBearBottom[i] = bearFvg.bottom;
      smc.fvgBearAge[i] = i - bearFvg.endIndex;
    }
    if (bullOb) {
      smc.obBullTop[i] = bullOb.top;
      smc.obBullBottom[i] = bullOb.bottom;
      smc.obBullAge[i] = i - bullOb.index;
      smc.obBullStrength[i] = bullOb.strength ?? 0;
    }
    if (bearOb) {
      smc.obBearTop[i] = bearOb.top;
      smc.obBearBottom[i] = bearOb.bottom;
      smc.obBearAge[i] = i - bearOb.index;
      smc.obBearStrength[i] = bearOb.strength ?? 0;
    }

    if (lastSweep && i - lastSweep.index <= 100) {
      smc.sweepSide[i] = lastSweep.side === 'high' ? 1 : -1;
      smc.sweepLevel[i] = lastSweep.level;
      smc.sweepWick[i] = lastSweep.wick;
      smc.sweepMagnitude[i] = lastSweep.magnitude ?? 0;
      smc.sweepAge[i] = i - lastSweep.index;
    }
    if (lastEvent && i - lastEvent.brokenAt <= 200) {
      smc.structureDirection[i] = lastEvent.direction === 'bullish' ? 1 : -1;
      smc.structureKind[i] = lastEvent.kind === 'bos' ? 1 : 2;
      smc.structureLevel[i] = lastEvent.level;
      smc.structureAge[i] = i - lastEvent.brokenAt;
    }
    if (lastSwingHigh) smc.swingHigh[i] = lastSwingHigh.price;
    if (lastSwingLow) smc.swingLow[i] = lastSwingLow.price;
  }
}

function pruneZones<T>(zones: ActiveZone<T>[], isDead: (zone: T) => boolean): void {
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    if (isDead(zones[i]!.zone)) zones.splice(i, 1);
  }
}

function capZones<T>(zones: ActiveZone<T>[]): void {
  if (zones.length > MAX_ACTIVE_ZONES) {
    zones.splice(0, zones.length - MAX_ACTIVE_ZONES);
  }
}

/**
 * Session levels (previous-day high/low, Asian range) computed incrementally.
 *
 * The shared `computePdhPdl` / `computeAsianRange` helpers are relative to the
 * *latest* bar in a window, so using them per bar would leak the future. This
 * walk only ever reads the current and prior UTC days.
 */
