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

// Canonical chat boundary types shared by setup, execution, and streaming.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { pickAiEnv } from '@kestrel/shared';
import type { Agent, AgentMemoryOption } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { ModelMessage, UIMessage } from 'ai';

import type { ChatModelResolution } from '@ai/models/model';
import type { GenerationLedger } from '@ai/persistence/generation-ledger';
import type { RoutingDecision } from '@ai/routing';
import type { SemanticRoutingAccounting } from '@ai/routing/semantic';
import type { ToolContext } from '@ai/runtime/tool-context';

import type { BuiltScorers } from '../../evals/scorers';
import type { ExecutionPlan } from '../../planning/execution-plan';
import type { MastraGenerationStats } from '../../shared/telemetry';
import type {
  MastraToolInvocationPart,
  MastraToolStreamEvent,
} from '../xauusd/legacy-tool-adapter';
import type { checkCanonicalEvidence } from './evidence';

export interface RunMastraCanonicalChatArgs {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  history: UIMessage[];
  settings: UserSettingsRow;
  /** Authenticated organization plan; never sourced from request/env input. */
  plan?: string | null;
  env: Parameters<typeof pickAiEnv>[0];
  customInstructions?: string;
  responseStyle?: 'default' | 'concise' | 'technical' | 'risk-first';
  citeSources?: boolean;
  signal?: AbortSignal;
  modelOverride?: string | null;
  /** Idempotency key of the already-persisted current user message. */
  backfillExcludeMessageIdempotencyKey?: string;
  runId?: string;
  /** Optional accounting sink for auxiliary model calls. */
  auxiliaryAccounting?: SemanticRoutingAccounting;
  /** Phase 2 planner contract. */
  executionPlan?: ExecutionPlan;
  /** Optional pre-computed routing decision (Audit v3 Phase 3). */
  routingDecision?: RoutingDecision;
  ledger?: GenerationLedger;
  /** Optional listener invoked in real time as read-only tools start and finish. */
  onToolEvent?: (event: MastraToolStreamEvent) => void;
}

export interface MastraCanonicalChatResult {
  text: string;
  modelId: string;
  providerId: string;
  routing: RoutingDecision;
  stats: MastraGenerationStats;
  totalCostUsd: number;
  totalLatencyMs: number;
  toolNames: string[];
  toolParts: MastraToolInvocationPart[];
  evidence: ReturnType<typeof checkCanonicalEvidence>;
  answerOutcome: 'ready' | 'blocked' | 'degraded';
  /** True when the silent self-correction pass rewrote an ungrounded draft (Q10). */
  repaired?: boolean;
  /** 'degraded' when native-memory preparation partially failed (Phase 9). */
  memoryMode: 'native' | 'degraded';
  /** Whether native memory preparation attempted legacy history backfill. */
  memoryBackfill: boolean;
  modelSnapshot: { providerId: string; bareModelId: string };
}

export interface CanonicalChatSetup {
  runId: string;
  agent: Agent;
  routing: RoutingDecision;
  resolution: ChatModelResolution;
  callMemory: AgentMemoryOption | null;
  requestContext: RequestContext<Record<string, unknown>>;
  toolPartsBuffer: MastraToolInvocationPart[];
  context: ToolContext;
  messages: ModelMessage[];
  scorers: BuiltScorers;
  /** Native-memory preparation partially failed; surface as degraded. */
  memoryDegraded: boolean;
  /** Whether native memory preparation attempted legacy history backfill. */
  memoryBackfill: boolean;
}

export interface MastraCanonicalChatStream {
  text: AsyncIterable<string>;
  completion: Promise<{
    text: string;
    stats: MastraGenerationStats;
    toolNames: string[];
    toolParts: MastraToolInvocationPart[];
    routing: RoutingDecision;
    modelId: string;
    providerId: string;
    totalCostUsd: number;
    totalLatencyMs: number;
    evidence: ReturnType<typeof checkCanonicalEvidence>;
    answerOutcome: 'ready' | 'blocked' | 'degraded';
    repaired?: boolean;
    memoryMode: 'native' | 'degraded';
    memoryBackfill: boolean;
    modelSnapshot: { providerId: string; bareModelId: string };
  }>;
}
