'use client';

// SPDX-License-Identifier: Apache-2.0

// Completed background-analysis job → UI projection. Kept separate from
// `job-stream.ts` so the polling state machine stays under the 350-LOC gate
// and the opinion/critique normalization is unit-testable in isolation.

import type { AgentProgress } from './types';

/** Raw `result` payload a completed analysis job stores in the queue row. */
export interface PolledJobResult {
  finalText?: string;
  messageId?: string | null;
  agentOpinions?: unknown[];
  committeeCritiques?: unknown[];
  mode?: string;
  symbol?: string;
  dataQuality?: string;
  totalCostUsd?: number;
  totalLatencyMs?: number;
}

export interface CompletedJobProjection {
  finalId: string;
  finalText: string;
  /** Settled `data-agent-progress` snapshot (null when no opinions arrived). */
  completedProgress: AgentProgress | null;
  /** `data-multi-agent-meta` payload persisted alongside the assistant text. */
  metaData: Record<string, unknown>;
}

interface NormalizedOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  summary: string;
  model?: string;
  latencyMs?: number;
}

function normalizeOpinions(raw: unknown[] | undefined): NormalizedOpinion[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter(
    (op): op is NormalizedOpinion =>
      typeof (op as NormalizedOpinion)?.agentName === 'string' &&
      ((op as NormalizedOpinion).bias === 'bullish' ||
        (op as NormalizedOpinion).bias === 'bearish' ||
        (op as NormalizedOpinion).bias === 'neutral') &&
      typeof (op as NormalizedOpinion).confidence === 'number' &&
      typeof (op as NormalizedOpinion).reasoning === 'string',
  );
  return valid.map((op) => ({
    agentName: op.agentName,
    bias: op.bias,
    confidence: op.confidence,
    reasoning: op.reasoning,
    summary: op.reasoning,
    ...(typeof (op as { model?: unknown }).model === 'string'
      ? { model: (op as { model: string }).model }
      : {}),
    ...(typeof (op as { latencyMs?: unknown }).latencyMs === 'number'
      ? { latencyMs: (op as { latencyMs: number }).latencyMs }
      : {}),
  }));
}

/**
 * The cross-examination ledger (`committeeCritiques` from
 * `packages/ai/src/committee/critique-steps.ts`). Malformed entries are
 * dropped so a single bad row can never break the settled dossier.
 */
export function normalizeCritiques(
  raw: unknown[] | undefined,
): NonNullable<AgentProgress['critiques']> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is NonNullable<AgentProgress['critiques']>[number] =>
        typeof (c as { agentName?: unknown })?.agentName === 'string' &&
        typeof (c as { confirms?: unknown }).confirms === 'boolean' &&
        typeof (c as { revisedConfidence?: unknown }).revisedConfidence === 'number' &&
        typeof (c as { critique?: unknown }).critique === 'string' &&
        (c as { critique: string }).critique.length > 0,
    )
    .map((c) => ({
      agentName: c.agentName,
      confirms: c.confirms,
      revisedConfidence: c.revisedConfidence,
      critique: c.critique,
    }));
}

/**
 * Project a completed job's raw result onto the settled progress snapshot and
 * the `data-multi-agent-meta` stream chunk. `mode`, `symbol`, and the
 * cross-examination critiques are preserved so the War Room and dossier can
 * hydrate from the persisted message after a reload.
 */
export function projectCompletedJob(
  result: PolledJobResult | undefined,
  fallbackId: string,
): CompletedJobProjection {
  const finalId = result?.messageId ?? fallbackId;
  const finalText = result?.finalText ?? '';
  const opinions = normalizeOpinions(result?.agentOpinions);
  const critiques = normalizeCritiques(result?.committeeCritiques);
  const symbol = result?.symbol;

  let completedProgress: AgentProgress | null = null;
  if (opinions.length > 0) {
    const modeStr = result?.mode ?? 'full';
    const defaultDesks =
      modeStr === 'single'
        ? ['technical']
        : ['technical', 'fundamental', 'risk', 'sentiment'];
    const opinionMap = new Map(opinions.map((op) => [op.agentName, op]));
    completedProgress = {
      mode: modeStr,
      stage: 'fusion',
      status: 'complete',
      agents: defaultDesks.map((agentName) => {
        const opinion = opinionMap.get(agentName);
        return {
          agentName,
          status: 'done' as const,
          ...(opinion ? { opinion } : {}),
        };
      }),
      ...(critiques.length > 0 ? { critiques } : {}),
      ...(symbol ? { symbol } : {}),
    };
  }

  return {
    finalId,
    finalText,
    completedProgress,
    metaData: {
      agentOpinions: result?.agentOpinions ?? [],
      committeeCritiques: critiques,
      mode: result?.mode ?? 'full',
      ...(symbol ? { symbol } : {}),
      ...(result?.dataQuality ? { dataQuality: result.dataQuality } : {}),
      totalCostUsd: result?.totalCostUsd ?? 0,
      totalLatencyMs: result?.totalLatencyMs ?? 0,
      messageId: finalId,
    },
  };
}
