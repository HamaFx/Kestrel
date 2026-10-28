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

/**
 * Phase 3 (Jev roadmap) — empirical desk accuracy for Committee Fusion.
 *
 * `apps/worker` grades historical `agent_opinions` against realized
 * `candles_1m` outcomes (see `jobs/opinion-calibration.ts`); this module turns
 * those graded observations into per-desk Brier scores and normalized
 * synthesis weights, and renders the compact markdown block the fusion
 * instructions embed. A desk with a lower Brier error has demonstrably better
 * calibrated calls and therefore earns a larger share of the synthesis weight.
 *
 * Desks without at least `MIN_DESK_SAMPLES` graded opinions keep the neutral
 * prior (equal share) instead of a noisy estimate.
 */

import { requireTenantIdForUser, schema, type DbClient } from '@kestrel/db';
import { and, desc, eq, gte } from 'drizzle-orm';

import { computeBrierScore, type ConfidenceObservation } from '../mastra-v2/shared/confidence';
import { getDb } from '../runtime/db';
import type { MastraSpecialistName } from './types';

/** Every committee desk, in a stable render order. */
export const SPECIALIST_DESKS: readonly MastraSpecialistName[] = [
  'technical',
  'fundamental',
  'risk',
  'sentiment',
];

/** Below this many graded opinions a desk keeps the neutral prior. */
export const MIN_DESK_SAMPLES = 5;

/** Neutral prior weight for a desk without a trustworthy sample. */
export const PRIOR_DESK_WEIGHT = 0.25;

/** Floors the raw reliability so one bad desk cannot drop to zero weight. */
export const MIN_DESK_RELIABILITY = 0.1;

/** Lookback window for graded opinions (90 days). */
export const DESK_RELIABILITY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** Graded opinions per desk used for the estimate (newest first). */
export const MAX_GRADED_OPINIONS_PER_DESK = 200;

export interface DeskReliabilityWeight {
  /** Normalized synthesis weight (priors keep 0.25; sampled desks share the rest). */
  weight: number;
  /** Mean squared error of stated confidence vs. realized outcome. */
  brierScore: number;
  /** Fraction of graded calls that were directionally correct. */
  accuracy: number;
  sampleSize: number;
}

export type DeskReliabilityWeights = Record<MastraSpecialistName, DeskReliabilityWeight>;

export interface OpinionOutcomeInput {
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

/**
 * Grade one opinion against the realized 4-hour price move.
 *   - `bullish` is correct when the close rose (`close > entry`);
 *   - `bearish` is correct when the close fell (`close < entry`);
 *   - `neutral` is correct when price stayed inside ±1×ATR₁ₕ — falling back to
 *     a ±0.3% band when no ATR is available (range-bound call, not a
 *     directional one).
 */
export function evaluateOpinionOutcome(
  opinion: OpinionOutcomeInput,
  entryPrice: number,
  closePrice4h: number,
  atr1h?: number,
): ConfidenceObservation {
  const move = closePrice4h - entryPrice;
  const neutralBand = Math.abs(atr1h ?? entryPrice * 0.003);
  const correct =
    opinion.bias === 'bullish'
      ? closePrice4h > entryPrice
      : opinion.bias === 'bearish'
        ? closePrice4h < entryPrice
        : Math.abs(move) <= neutralBand;
  return { confidence: opinion.confidence, correct };
}

function emptyObservations(): Record<MastraSpecialistName, ConfidenceObservation[]> {
  return { technical: [], fundamental: [], risk: [], sentiment: [] };
}

function isSpecialistDesk(value: string): value is MastraSpecialistName {
  return (SPECIALIST_DESKS as readonly string[]).includes(value);
}

/**
 * Normalize per-desk observations into fusion synthesis weights:
 *   - sampled desks (`n >= MIN_DESK_SAMPLES`) score `r_d = max(0.1, 1 − Brier)`
 *     and share the mass left after every prior desk takes `PRIOR_DESK_WEIGHT`;
 *   - unsampled desks keep the neutral `0.25` prior.
 * With all four desks sampled (or all four unsampled) the weights sum to 1.0.
 */
export function computeDeskReliabilityWeights(
  byDesk: Record<MastraSpecialistName, readonly ConfidenceObservation[]>,
): DeskReliabilityWeights {
  const report = {} as DeskReliabilityWeights;
  const sampled: Array<{ desk: MastraSpecialistName; reliability: number }> = [];
  let priorCount = 0;

  for (const desk of SPECIALIST_DESKS) {
    const observations = byDesk[desk] ?? [];
    const sampleSize = observations.length;
    const brierScore = computeBrierScore(observations);
    const accuracy =
      sampleSize > 0
        ? observations.filter((observation) => observation.correct).length / sampleSize
        : 0;
    if (sampleSize >= MIN_DESK_SAMPLES) {
      sampled.push({ desk, reliability: Math.max(MIN_DESK_RELIABILITY, 1 - brierScore) });
      report[desk] = { weight: 0, brierScore, accuracy, sampleSize };
    } else {
      priorCount += 1;
      report[desk] = { weight: PRIOR_DESK_WEIGHT, brierScore, accuracy, sampleSize };
    }
  }

  if (sampled.length === 0) {
    // Nothing graded yet: an equal prior for every desk keeps the synthesis
    // neutral instead of favoring an unmeasured desk.
    for (const desk of SPECIALIST_DESKS) {
      report[desk].weight = 1 / SPECIALIST_DESKS.length;
    }
    return report;
  }

  const sampledMass = Math.max(0, 1 - priorCount * PRIOR_DESK_WEIGHT);
  const totalReliability = sampled.reduce((sum, entry) => sum + entry.reliability, 0);
  for (const entry of sampled) {
    report[entry.desk].weight = (entry.reliability / totalReliability) * sampledMass;
  }
  return report;
}

/** True when at least one desk has enough graded history to weight on. */
export function hasDeskReliabilitySamples(weights: DeskReliabilityWeights): boolean {
  return SPECIALIST_DESKS.some((desk) => (weights[desk]?.sampleSize ?? 0) >= MIN_DESK_SAMPLES);
}

/** Compact markdown reliability block embedded in the fusion instructions. */
export function deskReliabilityBlock(weights: DeskReliabilityWeights): string {
  const lines = SPECIALIST_DESKS.map((desk) => {
    const entry = weights[desk];
    if (!entry || entry.sampleSize < MIN_DESK_SAMPLES) {
      return `- ${desk}: n<${MIN_DESK_SAMPLES} — neutral prior weight ${(entry?.weight ?? PRIOR_DESK_WEIGHT).toFixed(2)}`;
    }
    return `- ${desk}: weight ${entry.weight.toFixed(2)} · Brier ${entry.brierScore.toFixed(3)} · accuracy ${(entry.accuracy * 100).toFixed(0)}% · n=${entry.sampleSize}`;
  });
  return [
    'EMPIRICAL DESK RELIABILITY (graded historical calls; higher weight = better-calibrated desk — weigh the desks accordingly):',
    ...lines,
  ].join('\n');
}

export interface LoadDeskReliabilityArgs {
  userId: string;
  /** Lower bound on opinion age, ms epoch. Defaults to 90 days ago. */
  sinceMs?: number;
  /** Max graded opinions per desk used for the estimate. */
  limitPerDesk?: number;
  /** Injection seam for tests. Defaults to the DI-backed DB client. */
  db?: DbClient;
}

/**
 * Load a user's graded historical opinions and reduce them to per-desk
 * reliability weights. Tenant-scoped (`userId` + resolved `tenantId`) and
 * bounded by `sinceMs`/`limitPerDesk` so a full-mode run pays one indexed read.
 */
export async function loadDeskReliabilityWeights(
  args: LoadDeskReliabilityArgs,
): Promise<DeskReliabilityWeights> {
  const db = args.db ?? getDb();
  const tenantId = await requireTenantIdForUser(args.userId, db);
  const since = new Date(args.sinceMs ?? Date.now() - DESK_RELIABILITY_WINDOW_MS);
  const limitPerDesk = args.limitPerDesk ?? MAX_GRADED_OPINIONS_PER_DESK;
  const rows = await db
    .select({
      agentName: schema.agentOpinions.agentName,
      confidence: schema.agentOpinions.confidence,
      rawData: schema.agentOpinions.rawData,
    })
    .from(schema.agentOpinions)
    .where(
      and(
        eq(schema.agentOpinions.userId, args.userId),
        eq(schema.agentOpinions.tenantId, tenantId),
        gte(schema.agentOpinions.createdAt, since),
      ),
    )
    .orderBy(desc(schema.agentOpinions.createdAt))
    // Desks arrive in groups of four per run, so this window comfortably holds
    // `limitPerDesk` graded opinions for every desk.
    .limit(limitPerDesk * SPECIALIST_DESKS.length);

  const byDesk = emptyObservations();
  for (const row of rows) {
    if (!isSpecialistDesk(row.agentName)) continue;
    const raw = row.rawData as { correct?: unknown } | null;
    if (typeof raw?.correct !== 'boolean') continue;
    const bucket = byDesk[row.agentName];
    if (bucket.length >= limitPerDesk) continue;
    bucket.push({ confidence: row.confidence, correct: raw.correct });
  }
  return computeDeskReliabilityWeights(byDesk);
}
