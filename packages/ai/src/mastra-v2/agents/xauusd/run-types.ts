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

// XAUUSD Mastra runner boundary types.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { LanguageModel } from 'ai';

import type { ResolveModelEnv } from '@ai/models/env-factory';
import type { GenerationLedger } from '@ai/persistence/generation-ledger';

import type { XauusdResearchPacket } from '../../packets/research-types';
import type { ExecutionPlan } from '../../planning/execution-plan';
import type { MastraGenerationResultLike, MastraGenerationStats } from '../../shared/stats';
import type { MastraToolInvocationPart, MastraToolStreamEvent } from './legacy-tool-adapter';
import type { XauusdResearchReport } from './report/report-types';

export interface XauusdMastraSettings extends Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'> {
  embeddingModel?: UserSettingsRow['embeddingModel'];
  defaultSymbol?: UserSettingsRow['defaultSymbol'] | null;
  language?: UserSettingsRow['language'] | null;
  timezone?: UserSettingsRow['timezone'] | null;
}

export interface RunXauusdMastraArgs {
  prompt: string;
  userId: string;
  threadId: string;
  runId: string;
  settings: XauusdMastraSettings;
  env: ResolveModelEnv;
  /** Explicit user model override; operator pin is used when absent. */
  modelOverride?: string | null;
  signal?: AbortSignal;
  /** Idempotency key of the current user message already stored in Drizzle. */
  backfillExcludeMessageIdempotencyKey?: string;
  /** Telemetry kind for the run. */
  telemetryKind?: 'mastra_xauusd_research';
  /**
   * Explicit turn mode (Phase 7). `followup` answers from the saved verified
   * report instead of creating a new report and requires `priorReport`.
   */
  turnMode?: XauusdTurnMode;
  priorReport?: XauusdResearchReport | null;
  executionPlan?: ExecutionPlan;
  ledger?: GenerationLedger;
  /** Optional listener invoked in real time as read-only tools start and finish. */
  onToolEvent?: (event: MastraToolStreamEvent) => void;
}

/**
 * Explicit XAUUSD turn mode (Phase 7). `followup` answers from the saved
 * verified report's own data, NOT from fresh market data — this prevents
 * stale-report answers from mixing in today's prices.
 */
export type XauusdTurnMode = 'research' | 'conversation' | 'followup';

export interface XauusdMastraRunResult {
  result: MastraGenerationResultLike;
  report: XauusdResearchReport | null;
  packet: XauusdResearchPacket;
  modelId: string;
  providerId: string;
  bareModelId: string;
  stats: MastraGenerationStats;
  totalCostUsd: number;
  toolParts?: MastraToolInvocationPart[];
  answerOutcome: 'ready' | 'blocked' | 'degraded';
  modelSnapshot: { providerId: string; bareModelId: string };
  /** 'degraded' when native-memory preparation partially failed (Phase 9). */
  memoryMode: 'native' | 'degraded';
  /** Whether native memory preparation attempted legacy history backfill. */
  memoryBackfill: boolean;
}

export interface XauusdMastraConversationStream {
  text: AsyncIterable<string>;
  completion: Promise<{
    result: MastraGenerationResultLike;
    packet: XauusdResearchPacket;
    modelId: string;
    providerId: string;
    bareModelId: string;
    stats: MastraGenerationStats;
    toolParts: MastraToolInvocationPart[];
    answerOutcome: 'ready' | 'blocked' | 'degraded';
    modelSnapshot: { providerId: string; bareModelId: string };
    memoryMode: 'native' | 'degraded';
    memoryBackfill: boolean;
  }>;
}

export type XauusdMastraModel = LanguageModel;
