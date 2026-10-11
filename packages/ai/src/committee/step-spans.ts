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
 * Committee step spans (audit plan §5.4).
 *
 * Every committee stage (collect-packet, specialists, critique, verify,
 * fusion) emits one span record with the fields operators need to debug
 * quality and cost: packetId, modelId, latencyMs, and token cost. Spans
 * land in three places without new vendor lock-in:
 *   1. typed histogram metrics (`committee_step_latency_ms` /
 *      `committee_step_cost_usd`) for Prometheus-style p95s,
 *   2. a structured `ai`-category log line that Langfuse/Grafana ingest,
 *   3. the durable Mastra workflow snapshot (per-step state persists there
 *      already and needs no extra write here).
 */

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import type { CommitteeStepId } from './types';

const slog = createCategorizedLogger('ai', { component: 'committee-span' });

export interface CommitteeStepSpan {
  step: CommitteeStepId;
  runId: string;
  symbol: string;
  mode: string;
  packetId?: string;
  modelId?: string;
  latencyMs?: number;
  tokenCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  ok: boolean;
  error?: string;
}

/** Record one committee stage completion as metrics + a structured span log. */
export function recordCommitteeStepSpan(span: CommitteeStepSpan): void {
  if (span.latencyMs !== undefined) {
    metrics.observe('committee_step_latency_ms', span.latencyMs, {
      tags: { step: span.step, mode: span.mode, ok: span.ok ? 'true' : 'false' },
    });
  }
  if (span.tokenCostUsd !== undefined) {
    metrics.observe('committee_step_cost_usd', span.tokenCostUsd, {
      tags: { step: span.step, modelId: span.modelId ?? 'unknown' },
    });
  }
  const { step, runId, symbol, mode, ok, ...rest } = span;
  slog.info('committee step span', { step, runId, symbol, mode, ok, ...rest });
}
