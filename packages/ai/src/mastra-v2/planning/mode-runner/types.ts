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

// Contracts of the mode runner: settings slice, run arguments, and the
// result the callers (tools, workers, route handlers) consume.

import type { UserSettingsRow } from '@kestrel/db/schema';

import type { CommitteeCritique, MastraAnalysisMode, MastraModeOpinion } from '@ai/committee/types';
import type { ResolveModelEnv } from '@ai/models/env-factory';
import type { GenerationLedger } from '@ai/persistence/generation-ledger';

import { type SymbolResearchPacket } from '../../packets/symbol-research';
import type { MastraGenerationStats } from '../../shared/telemetry';
import type { ExecutionPlan } from '../execution-plan';

export interface MastraModeSettings extends Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> {
  embeddingModel?: UserSettingsRow['embeddingModel'];
  defaultSymbol?: UserSettingsRow['defaultSymbol'] | null;
  language?: UserSettingsRow['language'] | null;
  timezone?: UserSettingsRow['timezone'] | null;
  /** User-picked per-committee-agent top-tier models (§3.1). */
  agentModelOverrides?: UserSettingsRow['agentModelOverrides'];
}

export interface RunMastraModeArgs {
  prompt: string;
  symbol: string;
  /**
   * A-01 — bounded comparison symbols (2–3). When present the run executes
   * the cross-symbol comparison graph (one packet + one desk pass per symbol,
   * then a cross-symbol fusion) instead of the single-symbol committee.
   */
  symbols?: readonly string[];
  userId: string;
  threadId: string;
  runId: string;
  mode: MastraAnalysisMode;
  modelOverride?: string | null;
  settings: MastraModeSettings;
  env: ResolveModelEnv;
  signal?: AbortSignal;
  /** Idempotency key of the current user message already stored in Drizzle. */
  backfillExcludeMessageIdempotencyKey?: string;
  telemetryKind?: 'mastra_mode' | 'mastra_full_job';
  /**
   * Storage key for the run record. Defaults to the workflow's own id
   * (`symbol-research`); the durable Full-mode queue passes `full-analysis`
   * so the worker's run continues the record the web enqueued (Phase 3).
   */
  workflowId?: string;
  /** Restart an existing persisted workflow run instead of duplicating its steps. */
  resumeExisting?: boolean;
  /** Progress sink for durable workflow status projection. */
  onProgress?: (step: string) => void | Promise<void>;
  executionPlan?: ExecutionPlan | undefined;
  ledger?: GenerationLedger;
}

export interface MastraModeResult {
  finalText: string;
  agentOpinions: MastraModeOpinion[];
  /** §3.2: cross-critique peer reviews (full mode, Q6 ON by default). */
  committeeCritiques: CommitteeCritique[];
  mode: MastraAnalysisMode;
  symbol: string;
  packet: SymbolResearchPacket;
  /** A-01: compared symbols (2–3) for comparison runs. */
  symbols?: string[];
  /** A-01: one packet per compared symbol, prompt order (comparison runs). */
  comparisonPackets?: SymbolResearchPacket[];
  modelId: string;
  providerId: string;
  stats: MastraGenerationStats;
  totalCostUsd: number;
  totalLatencyMs: number;
  answerOutcome: 'ready' | 'blocked' | 'degraded';
  /** 'degraded' when native-memory preparation partially failed (Phase 9). */
  memoryMode: 'native' | 'degraded';
  /** Whether native memory preparation attempted legacy history backfill. */
  memoryBackfill: boolean;
  modelSnapshot: {
    providerId: string;
    bareModelId: string;
  };
  messageId?: string;
}
