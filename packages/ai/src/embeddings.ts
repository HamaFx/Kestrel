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

// Embedding helper. Sits behind the AI Gateway so the same model spec works
// in dev and prod ("openai/text-embedding-3-small" by default; switchable
// via env). The default model outputs 1536 dimensions — matches the
// `news_embeddings.embedding` column.
//
// We use AI SDK's top-level `embedMany` helper (v5) which:
//   - calls the provider with the right batching
//   - returns numeric arrays we can pass straight into pgvector
//
// Rate-limit handling is delegated to the gateway — there's no per-provider
// throttle here. If we later need to cap spend on embeddings specifically,
// add a counter alongside `chat_telemetry`.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { ServerEnv } from '@kestrel/shared';
import { decryptByok, type ProviderId } from '@kestrel/shared/encryption';
import { embedMany, type EmbeddingModel } from 'ai';

import { buildByokEmbeddingModel, providerCapabilities } from './byok-providers';
import { resolveEmbeddingModel } from './model';
import { resolveEmbeddingModelDetails } from './model-embedding';
import { envFallbackKeys } from './model-helpers';

const DEFAULT_MODEL = 'openai/text-embedding-3-small';

/**
 * Dimension of the `pgvector` columns (`news_embeddings.embedding`,
 * `memory_embeddings.embedding`). Both are fixed at `vector(1536)`; a model
 * that returns a different width would crash the query with SQLSTATE 22000, so
 * `embedTexts` validates it before the vector ever reaches Postgres.
 */
export const EXPECTED_EMBEDDING_DIMENSIONS = 1536;

export interface EmbedTextsArgs {
  texts: string[];
  /**
   * Explicit model override (takes precedence over userSettings +
   * env). Accepts either an instantiated EmbeddingModel or a string ID.
   */
  model?: EmbeddingModel | string;
  /**
   * Phase D2 — user's embedding model from
   * /settings/models → Advanced. When provided, the resolver picks
   * this over env.AI_EMBEDDING_MODEL and the hardcoded default.
   */
  userSettings?: Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>;
  /**
   * Legacy fallback — operator-set AI_EMBEDDING_MODEL. Used when
   * no userSettings are provided.
   */
  env?: Pick<ServerEnv, 'AI_EMBEDDING_MODEL'>;
  signal?: AbortSignal;
}

export interface EmbedResult {
  /** One float[] per input text, same order. */
  embeddings: number[][];
  model: string;
  /** AI SDK reports tokens at batch level. */
  inputTokens: number;
}

export async function embedTexts(args: EmbedTextsArgs): Promise<EmbedResult> {
  // Resolution priority:
  //   1. args.model (explicit caller override)
  //   2. resolveEmbeddingModelDetails(userSettings, env) — Phase D2 user pick
  //   3. env.AI_EMBEDDING_MODEL (legacy operator fallback)
  //   4. DEFAULT_MODEL
  let model: EmbeddingModel | string;
  let modelId = DEFAULT_MODEL;

  if (args.model) {
    if (typeof args.model === 'string') {
      modelId = args.model;
      const slash = modelId.indexOf('/');
      const providerId = (slash > 0 ? modelId.slice(0, slash) : 'openai') as ProviderId;
      const keys = {
        ...envFallbackKeys(args.env ?? {}),
        ...(args.userSettings ? (decryptByok(args.userSettings.aiApiKeys) ?? {}) : {}),
      };
      const apiKey = keys[providerId];
      if (apiKey && providerCapabilities[providerId]?.supportsEmbedding) {
        try {
          model = buildByokEmbeddingModel(providerId, modelId, apiKey);
        } catch {
          model = modelId;
        }
      } else {
        model = modelId;
      }
    } else {
      model = args.model;
      modelId = (args.model as { modelId?: string }).modelId ?? 'custom';
    }
  } else if (args.userSettings) {
    const resolvedModelId = resolveEmbeddingModel(args.userSettings, {
      ...(args.env?.AI_EMBEDDING_MODEL !== undefined
        ? { AI_EMBEDDING_MODEL: args.env.AI_EMBEDDING_MODEL }
        : {}),
    });
    modelId = resolvedModelId ?? DEFAULT_MODEL;

    const details = resolveEmbeddingModelDetails(args.userSettings, {
      ...(args.env?.AI_EMBEDDING_MODEL !== undefined
        ? { AI_EMBEDDING_MODEL: args.env.AI_EMBEDDING_MODEL }
        : {}),
    });
    model = typeof details.model === 'object' ? details.model : modelId;
  } else if (args.env?.AI_EMBEDDING_MODEL) {
    modelId = args.env.AI_EMBEDDING_MODEL;
    const slash = modelId.indexOf('/');
    const providerId = (slash > 0 ? modelId.slice(0, slash) : 'openai') as ProviderId;
    const keys = envFallbackKeys(args.env ?? {});
    const apiKey = keys[providerId];
    if (apiKey && providerCapabilities[providerId]?.supportsEmbedding) {
      try {
        model = buildByokEmbeddingModel(providerId, modelId, apiKey);
      } catch {
        model = modelId;
      }
    } else {
      model = modelId;
    }
  } else {
    // Universal default fallback (try operator env keys for openai)
    const keys = envFallbackKeys(args.env ?? {});
    if (keys.openai) {
      try {
        model = buildByokEmbeddingModel('openai', DEFAULT_MODEL, keys.openai);
      } catch {
        model = DEFAULT_MODEL;
      }
    } else {
      model = DEFAULT_MODEL;
    }
  }

  // AI SDK v5 expects either a model instance or a model string when the
  // gateway is configured globally via AI_GATEWAY_API_KEY.
  const callArgs: Parameters<typeof embedMany>[0] = {
    model,
    values: args.texts,
    // Pin the output width to the pgvector column size. Google's
    // gemini-embedding-001 defaults to 3072 dimensions unless the caller
    // asks for a supported truncated size (the provider maps `dimensions`
    // to `outputDimensionality`), which would fail the validation below.
    dimensions: EXPECTED_EMBEDDING_DIMENSIONS,
  };
  if (args.signal) callArgs.abortSignal = args.signal;

  const result = await embedMany(callArgs);

  const embeddings = result.embeddings as number[][];
  for (const vec of embeddings) {
    if (vec.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding model "${modelId}" returned ${vec.length} dimensions; expected ${EXPECTED_EMBEDDING_DIMENSIONS}.`,
      );
    }
  }

  return {
    embeddings,
    model: modelId,
    inputTokens: result.usage?.tokens ?? 0,
  };
}

/**
 * Format an embedding as the `pgvector` literal `[v1,v2,…,vN]`. Used by
 * `searchMemory` and `runDenseNewsQuery` when binding the vector into a
 * `<=>` (cosine-distance) operator. Centralised here (Phase 3 hardening
 * §20) so the format stays consistent if pgvector ever tightens its
 * grammar — and so a typo doesn't drift between the two call sites.
 */
export function vectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}
