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
 * Committee fusion verifier (audit plan §1.4, P0-1). Specialists are
 * verified per-opinion, but the free-form fusion answer previously reached
 * the user unverified and could hallucinate prices/levels that appear in
 * neither the packet nor any specialist opinion. This verifier mirrors the
 * XAUUSD report grounding discipline: every numeric value in the fusion
 * text must be supported by packet evidence, a verified specialist opinion,
 * structural notation, or scenario-projection wording.
 *
 * Q3 decision: a failed verification is terminal after one bounded repair —
 * never a degraded partial answer.
 */

import { metrics } from '@kestrel/shared';

import { extractNarrativeNumbers } from '../mastra/report-grounding';
import type { SymbolResearchPacket } from '../mastra/symbol-research';
import type { MastraModeOpinion } from './types';

export interface FusionVerification {
  ok: boolean;
  findings: string[];
}

/** Evidence tolerance: legitimate integer rounding of indicator readings. */
const EVIDENCE_TOLERANCE = 0.5;

/** Scenario-projection wording exempts forward-looking numbers from grounding. */
const SCENARIO_PROJECTION_WINDOW =
  /\b(?:target|entry(?:\s+zone)?|invalidation|trigger|take.?profit|stop.?loss|\btp\b|\bsl\b|risk.?reward|r\s*:?s*r)\b/i;

/** Character window around a match considered "scenario context". */
const SCENARIO_CONTEXT_CHARS = 32;

function packetEvidenceValues(packet: SymbolResearchPacket): number[] {
  const values: number[] = [];
  if (packet.price) {
    values.push(packet.price.tick.bid, packet.price.tick.ask, packet.price.tick.mid);
  }
  for (const evidence of packet.timeframes) {
    for (const candle of evidence.candles) {
      values.push(candle.o, candle.h, candle.l, candle.c);
    }
    for (const indicator of evidence.indicators) {
      for (const result of indicator.values) {
        if (typeof result === 'number' && Number.isFinite(result)) values.push(result);
        else if (result && typeof result === 'object') {
          for (const nested of Object.values(result)) {
            if (typeof nested === 'number' && Number.isFinite(nested)) values.push(nested);
          }
        }
      }
    }
  }
  // §4.2: the XAUUSD macro extension is grounding evidence for macro
  // numbers (dollar index, real yields, event prints).
  for (const series of [
    packet.xauusdExtension?.dollarIndex,
    packet.xauusdExtension?.realYields,
    packet.xauusdExtension?.breakevenInflation,
  ]) {
    for (const point of series ?? []) values.push(point.value);
  }
  for (const event of packet.xauusdExtension?.events ?? []) {
    for (const print of [event.actual, event.forecast, event.previous]) {
      if (typeof print === 'number' && Number.isFinite(print)) values.push(print);
    }
  }
  return values;
}

function opinionGroundedValues(opinions: readonly MastraModeOpinion[]): Set<number> {
  // Specialist reasoning is itself verified against the packet before fusion
  // (verifyMastraOpinion), so any number a specialist quoted is grounded.
  const grounded = new Set<number>();
  for (const opinion of opinions) {
    for (const value of extractNarrativeNumbers(opinion.reasoning)) grounded.add(value);
  }
  return grounded;
}

function isScenarioProjection(text: string, index: number, length: number): boolean {
  const windowStart = Math.max(0, index - SCENARIO_CONTEXT_CHARS);
  const windowEnd = Math.min(text.length, index + length + SCENARIO_CONTEXT_CHARS);
  return SCENARIO_PROJECTION_WINDOW.test(text.slice(windowStart, windowEnd));
}

function emitVerificationMetrics(ok: boolean, findings: readonly string[]): void {
  metrics.increment('committee_fusion_verification_total', {
    tags: { result: ok ? 'ok' : 'fail' },
  });
  if (!ok) {
    metrics.increment('committee_fusion_verification_failed_total', {
      tags: { reason: findings.some((f) => /empty/.test(f)) ? 'empty' : 'grounding' },
    });
  }
}

/**
 * Deterministically verify the free-form fusion answer against the packet
 * and the verified specialist opinions it synthesizes.
 */
export function verifyFusionAnswer(
  text: string,
  packet: SymbolResearchPacket,
  opinions: readonly MastraModeOpinion[],
): FusionVerification {
  const findings: string[] = [];

  if (!text || !text.trim()) {
    findings.push('fusion answer is empty');
    emitVerificationMetrics(false, findings);
    return { ok: false, findings };
  }

  // A blocked/degraded packet has no numeric evidence to ground against;
  // numeric answers over missing data are rejected (mirrors verifyMastraOpinion).
  if (packet.status !== 'ready') {
    if (/\d/.test(text)) {
      findings.push('numeric claims are not allowed when packet data is unavailable');
    }
    emitVerificationMetrics(findings.length === 0, findings);
    return { ok: findings.length === 0, findings };
  }

  const evidenceValues = packetEvidenceValues(packet);
  const opinionValues = opinionGroundedValues(opinions);
  const reported = new Set<string>();

  for (const value of extractNarrativeNumbers(text)) {
    const key = String(value);
    if (reported.has(key)) continue;
    reported.add(key);
    if (opinionValues.has(value)) continue;
    const supported = evidenceValues.some(
      (evidenceValue) => Math.abs(evidenceValue - value) <= EVIDENCE_TOLERANCE,
    );
    if (supported) continue;
    if (isScenarioProjection(text, text.indexOf(key), key.length)) continue;
    findings.push(
      `fusion answer contains unsupported numeric value ${value}; it must come from the packet, a specialist opinion, or be labeled as a scenario projection`,
    );
  }

  emitVerificationMetrics(findings.length === 0, findings);
  return { ok: findings.length === 0, findings };
}

/**
 * Repair prompt for the single bounded fusion regeneration (audit plan
 * §1.4). Mirrors `repairPrompt` from the XAUUSD report path.
 */
export function fusionRepairPrompt(prompt: string, findings: readonly string[]): string {
  return [
    prompt,
    '',
    'The previous committee synthesis failed deterministic verification.',
    'Return a corrected answer using only the trusted packet and the specialist opinions.',
    'Do not remove evidence, disclosure, or scenario language to bypass verification.',
    `Verification findings to fix:\n${findings.map((finding) => `- ${finding}`).join('\n')}`,
  ].join('\n');
}
