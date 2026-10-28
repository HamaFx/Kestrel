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

// Agent sub-barrel: BYOK providers and models, execution lifecycle and
// generation ledger, routing/memory services, and the serializable Mastra
// execution plan/decision facades. Re-exported by `src/index.ts`.

export {
  hasUserKeyForProvider,
  resolveProviderMode,
  type ProviderMode,
} from '../models/byok-providers';
export {
  createExecutionLifecycle,
  terminalMetadata,
  type ExecutionTerminalState,
  type ExecutionAnswerOutcome,
  type ExecutionTerminalMetadata,
} from '../runtime/execution-lifecycle';
export {
  createGenerationLedger,
  restoreGenerationLedger,
  type GenerationKind,
  type GenerationLedger,
  type GenerationLedgerEntry,
  type GenerationLedgerSnapshot,
} from '../persistence/generation-ledger';
export {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  getProvider,
  defaultModelFor,
  lookupModelRate,
  buildCatalogRateTable,
  type ByokProviderSpec,
  type ByokProviderModels,
  type ModelDomain,
  type ModelSpec,
} from '../models/byok-providers';
export {
  resolveChatModel,
  resolveModelForProvider,
  resolveMastraModel,
  resolveMastraExecutionModel,
  resolveVisionModel,
  resolveEmbeddingModel,
  resolveEmbeddingModelDetails,
  derivePlannerModel,
  deriveTitleModel,
  testProviderKey,
  validateProviderConfig,
  type ChatModelResolution,
  type MastraModelPurpose,
  type MastraModelSnapshot,
  type ResolveMastraModelInput,
  type MastraResolvedModel,
  type VisionModelResolution,
  type EmbeddingModelResolution,
  type EmbeddingModelResolutionDetails,
} from '../models/model';
export { embedTexts, type EmbedTextsArgs, type EmbedResult } from '../models/embeddings';

// Phase 7a — domain routing + rolling thread summary
export {
  resolveSemanticRoutingConfig,
  routeTurn,
  type RoutingDecision,
  type RoutingDomain,
} from '../routing';
export type { SemanticRoutingAccounting } from '../routing/semantic';

// Phase 7b — memory index
export {
  rememberJournalEntry,
  rememberBriefing,
  rememberThreadSynopsis,
  // Phase 3 (Jev roadmap) — JEPA-style market-regime memories.
  composeRegimeStateText,
  rememberMarketRegime,
  searchMemory,
  countMemory,
  type MemoryKind,
  type MemoryRow,
  type RegimeOutcome,
  type RememberMarketRegimeArgs,
} from '../memory/memory-index';
export { runMemoryQuery, memoryRowToItem, type RunMemoryQueryArgs } from '../models/rag';

// M4 — Model circuit breaker for repeated failures.
export {
  recordModelSuccess,
  recordModelFailure,
  isCircuitOpen,
  _resetCircuits,
} from '../models/circuit-breaker';

// Phase 2 — one serializable Mastra execution plan.
export {
  createExecutionPlan,
  parseExecutionPlan,
  serializeExecutionPlan,
  resolvedModelSnapshotForPlan,
  requireExecutionPlanModel,
  assertExecutionPlanRoute,
  ExecutionPlanSchema,
  type ExecutionPlan,
  type CreateExecutionPlanInput,
} from '../mastra-v2/planning/execution-plan';

// Canonical Mastra execution decision facade.
export {
  decideMastraExecution,
  capabilityForRoute,
  capabilityDefinitionForRoute,
  type MastraExecutionDecision,
  type MastraExecutionDecisionInput,
  type MastraExecutionRoute,
} from '../mastra-v2/planning/execution-decision';

// Canonical Mastra routing and historical opinion persistence.
export { resolveMode, type AnalysisMode, type ResolvedMode } from '../mastra-v2/planning/routing-policy';
export {
  saveAgentOpinions,
  saveAgentOpinionsBestEffort,
  listAgentOpinions,
  listMessageOpinions,
  type SaveOpinionsArgs,
} from '../multi-agent/persistence';

// F3 — Social Sentiment Integration
export {
  SocialSentimentService,
  getSentimentService,
  resetSentimentService,
  type SentimentEnv,
} from '../sentiment';
