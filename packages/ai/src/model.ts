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

// Model resolver barrel — split from a monolithic ~762-line module into
// 6 focused sub-modules (architecture-audit P1-1, SRP compliance).
//
//   model-helpers.ts    — pure utilities (PROVIDER_PRIORITY, envFallbackKeys,
//                          supportsPromptCaching, parsePickedModelId)
//   model-chat.ts       — chat model resolution (resolveChatModel,
//                          resolveModelForProvider, derivePlannerModel,
//                          deriveTitleModel)
//   model-vision.ts     — vision model resolution (resolveVisionModel)
//   model-embedding.ts  — embedding model resolution (resolveEmbeddingModel)
//   model-override.ts   — explicit override resolution (resolveOverrideModel)
//
// Pattern: Factory. resolveChatModel/resolveVisionModel are Factory methods.
// Audit v2 §4.2 — the dead model-strategy.ts (MODEL_ROUTER /
// TIER_TO_DOMAIN / routeModelByDomain, no live caller) was deleted.

// ── Low-level environment model factory ──────────────────────────────
export { resolveModel, type ResolveModelEnv } from './env-model-factory';

// ── Provider key tester & validator ──────────────────────────────────
export { testProviderKey, validateProviderConfig, type ProviderValidationResult } from './provider-tester';

// ── BYOK registry re-exports ─────────────────────────────────────────
export {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  defaultModelFor,
  providerCapabilities,
  type ProviderCapability,
} from './byok-providers';
export type { ModelDomain, ByokProviderSpec } from './byok-providers';

// ── Helpers (pure utilities) ─────────────────────────────────────────
export { PROVIDER_PRIORITY, supportsPromptCaching } from './model-helpers';
// Note: envFallbackKeys and parsePickedModelId are internal —
// imported directly by sibling resolver modules (model-chat.ts,
// model-vision.ts, etc.) but NOT re-exported from the public barrel.

// ── Role-based model resolution ──────────────────────────────────────
export {
  resolveModelForRole,
  type ModelRole,
  type ModelRoleResolution,
  type ResolveRoleOptions,
} from './model-role';

// ── Chat model resolution ────────────────────────────────────────────
export {
  resolveChatModel,
  resolveModelForProvider,
  derivePlannerModel,
  deriveTitleModel,
} from './model-chat';
export {
  resolveMastraModel,
  resolveMastraExecutionModel,
  MastraModelSnapshotSchema,
} from './model-resolution';
export type {
  ChatModelResolution,
  MastraModelPurpose,
  MastraModelSnapshot,
  ResolveMastraModelInput,
  MastraResolvedModel,
} from './model-resolution';


// ── Vision model resolution ──────────────────────────────────────────
export { resolveVisionModel } from './model-vision';
export type { VisionModelResolution } from './model-vision';

// ── Embedding model resolution ───────────────────────────────────────
export { resolveEmbeddingModel } from './model-embedding';
export type { EmbeddingModelResolution } from './model-embedding';

// ── Override model resolution ────────────────────────────────────────
export { resolveOverrideModel } from './model-override';
export type { OverrideResolution } from './model-override';
