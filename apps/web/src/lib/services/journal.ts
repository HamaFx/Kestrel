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

// PF-22 — Journal service layer.
//
// Separates business logic from HTTP handling. Route handlers (controllers)
// call these service functions instead of importing @kestrel/ai directly.
// The service layer handles:
//   - Input validation (re-exports Zod schemas)
//   - Authorization checks (scoped to userId)
//   - Error wrapping (converts domain errors to typed results)
//   - Response formatting (returns typed DTOs)
//
// Pattern: Service (PF-22). Each domain (journal, alerts, portfolio, etc.)
// gets its own service file. Controllers remain thin: parse request →
// call service → format Response.

import {
  computeStats,
  createEntry,
  deleteEntry,
  getCoachInsights,
  getEntry,
  listEntries,
  updateEntry,
  type CoachInsightsResult,
} from '@kestrel/ai';
import { getCandles } from '@kestrel/data';
import type { UserSettingsRow } from '@kestrel/db';
import { ema, rsi } from '@kestrel/indicators';
import {
  msPerTimeframe,
  pipSize,
  SymbolSchema,
  TimeframeSchema,
  TradeOutcomeSchema,
  TradeSideSchema,
  type JournalEntry,
  type ServerEnv,
  type Timeframe,
} from '@kestrel/shared';
import { z } from 'zod';

// ── Schemas (shared between controller and tests) ──────────────────────────

export const JournalCreateSchema = z.object({
  symbol: SymbolSchema,
  side: TradeSideSchema,
  openedAt: z.int(),
  entry: z.number(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  screenshotUrl: z.string().nullable().optional(),
});

export const JournalPatchSchema = z.object({
  closedAt: z.int().nullable().optional(),
  exit: z.number().nullable().optional(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  outcome: TradeOutcomeSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export type JournalCreateInput = z.infer<typeof JournalCreateSchema>;
export type JournalPatchInput = z.infer<typeof JournalPatchSchema>;

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface EntryDTO {
  id: string;
  symbol: string;
  side: string;
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  size: number | null;
  notes: string | null;
  tags: string[];
  screenshotUrl: string | null;
  attachments: string[];
  openedAt: number;
  closedAt: number | null;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTO mappers ─────────────────────────────────────────────────────────────

/** Map domain JournalEntry → EntryDTO (number timestamps → Date objects). */
function toEntryDTO(e: JournalEntry): EntryDTO {
  return {
    id: e.id,
    symbol: e.symbol,
    side: e.side,
    entry: e.entry,
    exit: e.exit,
    stop: e.stop,
    target: e.target,
    size: e.size,
    notes: e.notes,
    tags: e.tags,
    screenshotUrl: e.screenshotUrl ?? null,
    attachments: e.attachments ?? [],
    openedAt: e.openedAt,
    closedAt: e.closedAt,
    outcome: e.outcome,
    createdAt: new Date(e.createdAt),
    updatedAt: new Date(e.updatedAt),
  };
}

// ── Service functions ─────────────────────────────────────────────────────

export async function listJournalEntriesService(
  userId: string,
  opts?: { symbol?: string },
): Promise<{ entries: EntryDTO[]; stats: Record<string, unknown> }> {
  const [entries, stats] = await Promise.all([listEntries(userId, opts), computeStats(userId)]);
  return { entries: entries.map(toEntryDTO), stats };
}

export async function createJournalEntryService(
  userId: string,
  input: JournalCreateInput,
): Promise<EntryDTO> {
  const entry = await createEntry({
    userId,
    symbol: input.symbol,
    side: input.side,
    openedAt: input.openedAt,
    entry: input.entry,
    stop: input.stop ?? null,
    target: input.target ?? null,
    size: input.size ?? null,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    screenshotUrl: input.screenshotUrl ?? null,
  });
  return toEntryDTO(entry);
}

export async function getJournalEntryService(userId: string, id: string): Promise<EntryDTO | null> {
  const entry = await getEntry(userId, id);
  return entry ? toEntryDTO(entry) : null;
}

export async function updateJournalEntryService(
  userId: string,
  id: string,
  input: JournalPatchInput,
): Promise<EntryDTO | null> {
  const entry = await updateEntry(userId, id, input);
  return entry ? toEntryDTO(entry) : null;
}

export async function deleteJournalEntryService(userId: string, id: string): Promise<boolean> {
  return deleteEntry(userId, id);
}

// ── Setup Replay & Coach Insights ──────────────────────────────────────────

export interface ReplayCandleDTO {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number | null;
  ema20?: number;
  ema50?: number;
  rsi?: number;
}

export interface TradeSetupReplayDTO {
  entry: EntryDTO;
  symbol: string;
  timeframe: Timeframe;
  candles: ReplayCandleDTO[];
  mfe: {
    price: number;
    pips: number;
    r: number | null;
  };
  mae: {
    price: number;
    pips: number;
    r: number | null;
  };
  stats: {
    durationMs: number | null;
    openIndex: number;
    closeIndex: number | null;
    plannedRR: number | null;
    realizedRR: number | null;
    executionEfficiencyPct: number | null;
    /** True when the historical window fell outside provider retention and fell back to latest bars. */
    replayWindowFallback?: boolean;
  };
  keyLevels: {
    entry: number;
    stop: number | null;
    target: number | null;
    exit: number | null;
  };
}

export async function getCoachInsightsService(args: {
  userId: string;
  userSettings: UserSettingsRow;
  env: ServerEnv;
  signal?: AbortSignal;
}): Promise<CoachInsightsResult> {
  return getCoachInsights({
    userId: args.userId,
    userSettings: args.userSettings,
    env: args.env,
    signal: args.signal,
  });
}

const REPLAY_WARMUP_BARS = 55;
const REPLAY_POST_CLOSE_BARS = 20;
const REPLAY_MIN_BARS = 140;
const REPLAY_MAX_BARS = 1000;
const WEEKEND_PAD_MS = 48 * 60 * 60 * 1000;

/**
 * Compute the date-bounded (`from` / `to`) OHLC window for Trade Setup Replay.
 *
 * Includes 55 bars of lead-in before `openedAt` so `ema(20)`, `ema(50)`, and
 * `rsi(14)` warm up accurately before the entry bar (plus a 48h weekend pad
 * when the warmup window crosses a weekend), and 20 bars after `closedAt`
 * (capped at BiQuote's 1,000-bar limit).
 */
export function computeReplayWindow(
  openedAt: number,
  closedAt: number | null,
  tf: Timeframe,
  nowMs: number = Date.now(),
): { from: string; to: string; count: number } {
  const tfMs = msPerTimeframe(tf);
  const effectiveCloseMs = closedAt && closedAt >= openedAt ? closedAt : nowMs;
  const rawWarmupMs = REPLAY_WARMUP_BARS * tfMs;
  let fromMs = openedAt - rawWarmupMs;

  // Pad 48h when the warmup window crosses a weekend so at least 55 trading bars precede openedAt.
  const openDay = new Date(openedAt).getUTCDay();
  const fromDay = new Date(fromMs).getUTCDay();
  if (openDay === 0 || openDay === 1 || fromDay === 6 || fromDay === 0 || fromDay > openDay) {
    fromMs -= WEEKEND_PAD_MS;
  }

  let toMs = Math.min(nowMs, effectiveCloseMs + REPLAY_POST_CLOSE_BARS * tfMs);
  const tradeBars = Math.max(1, Math.ceil((effectiveCloseMs - openedAt) / tfMs));
  const desiredBars = REPLAY_WARMUP_BARS + tradeBars + REPLAY_POST_CLOSE_BARS + 10;
  const count = Math.min(REPLAY_MAX_BARS, Math.max(REPLAY_MIN_BARS, desiredBars));

  if (desiredBars > REPLAY_MAX_BARS) {
    const maxSpanMs = (REPLAY_MAX_BARS - REPLAY_WARMUP_BARS) * tfMs;
    toMs = Math.min(toMs, openedAt + maxSpanMs);
  }

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(Math.max(openedAt + tfMs, toMs)).toISOString(),
    count,
  };
}

export async function getTradeSetupReplayService(args: {
  userId: string;
  id: string;
  timeframe?: Timeframe;
}): Promise<TradeSetupReplayDTO | null> {
  const { userId, id, timeframe = '15m' } = args;
  const entry = await getEntry(userId, id);
  if (!entry) return null;

  const tf = TimeframeSchema.parse(timeframe);

  const durationMs = entry.closedAt ? entry.closedAt - entry.openedAt : null;
  const window = computeReplayWindow(entry.openedAt, entry.closedAt, tf);

  let replayWindowFallback = false;
  let candleList = await getCandles(entry.symbol, tf, {
    count: window.count,
    from: window.from,
    to: window.to,
  }).catch(() => []);

  if (candleList.length === 0) {
    replayWindowFallback = true;
    candleList = await getCandles(entry.symbol, tf, {
      count: REPLAY_MIN_BARS,
    });
  }

  const ema20 = ema(candleList, 20);
  const ema50 = ema(candleList, 50);
  const rsi14 = rsi(candleList, 14);

  const candles: ReplayCandleDTO[] = candleList.map((c, i) => ({
    t: c.t,
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
    v: c.v,
    ema20: ema20[i] ?? undefined,
    ema50: ema50[i] ?? undefined,
    rsi: rsi14[i] ?? undefined,
  }));

  // Find candle closest to open time
  let openIdx = 0;
  let minOpenDiff = Infinity;
  candles.forEach((c, idx) => {
    const diff = Math.abs(c.t - entry.openedAt);
    if (diff < minOpenDiff) {
      minOpenDiff = diff;
      openIdx = idx;
    }
  });

  // Find candle closest to close time
  let closeIdx: number | null = null;
  if (entry.closedAt) {
    let minCloseDiff = Infinity;
    candles.forEach((c, idx) => {
      const diff = Math.abs(c.t - entry.closedAt!);
      if (diff < minCloseDiff) {
        minCloseDiff = diff;
        closeIdx = idx;
      }
    });
  }

  const endIdx = closeIdx !== null ? closeIdx : candles.length - 1;
  const startIdx = Math.min(openIdx, endIdx);

  let highestHigh = entry.entry;
  let lowestLow = entry.entry;

  for (let i = startIdx; i <= endIdx; i++) {
    const bar = candles[i];
    if (bar) {
      if (bar.h > highestHigh) highestHigh = bar.h;
      if (bar.l < lowestLow) lowestLow = bar.l;
    }
  }

  const pip = pipSize(entry.symbol);
  const isLong = entry.side === 'long';
  const riskPrice = entry.stop ? Math.abs(entry.entry - entry.stop) : null;
  const plannedTargetPrice = entry.target ? Math.abs(entry.target - entry.entry) : null;
  const plannedRR =
    riskPrice && plannedTargetPrice && riskPrice > 0 ? plannedTargetPrice / riskPrice : null;

  const mfePrice = isLong ? highestHigh : lowestLow;
  const maePrice = isLong ? lowestLow : highestHigh;

  const mfePips = isLong ? (highestHigh - entry.entry) / pip : (entry.entry - lowestLow) / pip;
  const maePips = isLong ? (entry.entry - lowestLow) / pip : (highestHigh - entry.entry) / pip;

  const mfeR =
    riskPrice && riskPrice > 0
      ? isLong
        ? (highestHigh - entry.entry) / riskPrice
        : (entry.entry - lowestLow) / riskPrice
      : null;
  const maeR =
    riskPrice && riskPrice > 0
      ? isLong
        ? (entry.entry - lowestLow) / riskPrice
        : (highestHigh - entry.entry) / riskPrice
      : null;

  let realizedRR = entry.rMultiple ?? null;
  if (realizedRR === null && entry.exit && riskPrice && riskPrice > 0) {
    realizedRR = isLong
      ? (entry.exit - entry.entry) / riskPrice
      : (entry.entry - entry.exit) / riskPrice;
  }

  let executionEfficiencyPct: number | null = null;
  if (realizedRR !== null && mfeR !== null && mfeR > 0) {
    executionEfficiencyPct = Math.min(100, Math.max(0, (realizedRR / mfeR) * 100));
  }

  return {
    entry: toEntryDTO(entry),
    symbol: entry.symbol,
    timeframe: tf,
    candles,
    mfe: {
      price: mfePrice,
      pips: Math.max(0, mfePips),
      r: mfeR !== null ? Math.max(0, mfeR) : null,
    },
    mae: {
      price: maePrice,
      pips: Math.max(0, maePips),
      r: maeR !== null ? Math.max(0, maeR) : null,
    },
    stats: {
      durationMs,
      openIndex: openIdx,
      closeIndex: closeIdx,
      plannedRR,
      realizedRR,
      executionEfficiencyPct,
      ...(replayWindowFallback ? { replayWindowFallback: true } : {}),
    },
    keyLevels: {
      entry: entry.entry,
      stop: entry.stop ?? null,
      target: entry.target ?? null,
      exit: entry.exit ?? null,
    },
  };
}
