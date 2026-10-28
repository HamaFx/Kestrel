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
 * Kestrel Mastra Memory (Phase 1).
 *
 * One Memory instance per request, sharing the Phase 0 storage and vector
 * stores. The embedder is BYOK per-user, so the Memory wrapper must be built
 * per request (exactly like agents are built per request with the user's
 * BYOK chat model). The storage composite and vector store are process-wide
 * singletons and never re-created per request.
 *
 * Layers:
 * - message history (lastMessages: 20) — the agent's thread context
 * - working memory (resource-scoped markdown preferences) — seeded once from
 *   Drizzle userSettings by `./context.ts`
 * - semantic recall — BYOK embedding model via the existing resolver,
 *   gated by `ENABLE_MASTRA_SEMANTIC_RECALL` (default on)
 * - observational memory — gated by `ENABLE_MASTRA_OBSERVATIONAL_MEMORY`
 *   (default off; best enabled on long-lived worker/durable paths, not
 *   short-lived Vercel functions, because it spawns background agents)
 *
 * The old `ENABLE_MASTRA_MEMORY` flag is retired: memory is now always on
 * for Mastra paths.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { MemoryConfigInternal } from '@mastra/core/memory';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { MastraEmbeddingModel, MastraVector } from '@mastra/core/vector';
import { LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { PgVector } from '@mastra/pg';

import { embedTexts } from '../models/embeddings';
import type { ResolveModelEnv } from '../models/env-factory';
import { resolveEmbeddingModel } from '../models/model';
import { getKestrelMastra } from './instance';
import {
  ensureLibsqlParent,
  mastraRuntimeConnectionString,
  mastraSslOptions,
  resolveMastraStorageKind,
  type MastraStorageKind,
} from './storage';

const mlog = createCategorizedLogger('ai', { component: 'mastra:memory' });

export const KESTREL_MEMORY_LAST_MESSAGES = 20;
export const KESTREL_MEMORY_SEMANTIC_TOP_K = 4;

// ---------------------------------------------------------------------------
// Observational-memory budget (Phase 9)
// ---------------------------------------------------------------------------

/**
 * Conservative USD estimate for ONE model refinement that Mastra's
 * observational memory performs per observed thread message (the background
 * memory-refinement agents run inside the Memory and never flow through
 * Kestrel's generation ledger). Kept separate from the visible-turn estimate
 * so durable paths that enable observational memory are independently
 * budgeted up front.
 */
export const OBSERVATIONAL_MEMORY_REFINING_STEP_USD = 0.004;

/** Number of refinements (embed + generate) per observed message. */
export const OBSERVATIONAL_MEMORY_REFINEMENTS_PER_MESSAGE = 2;

/**
 * Budget allowance, in USD, for the observational-memory background work of
 * one observed turn (defaults to a single message). Durable jobs that enable
 * observational memory add this to their enqueue/resume reservation so the
 * background spend is bounded and never silently unbilled.
 */
export function observationalMemoryAllowanceUsd(messageCount = 1): number {
  return (
    messageCount *
    OBSERVATIONAL_MEMORY_REFINEMENTS_PER_MESSAGE *
    OBSERVATIONAL_MEMORY_REFINING_STEP_USD
  );
}

/**
 * Default working-memory template; seeded from Drizzle by `./context.ts`.
 * Model-visible user preferences only — runtime configuration (model picks,
 * provider, budget, limits) is deliberately absent (Phase 9).
 *
 * Phase 3: the resource-scoped block may additionally carry a
 * `# Trader Edge & Risk Profile` section written by
 * `syncTraderProfileToWorkingMemory()` from `journal/coach-insights.ts`. The
 * seed never writes or clears that section, so subsequent chat turns preserve
 * the trader's journal edge and behavioral leaks.
 */
export const KESTREL_WORKING_MEMORY_TEMPLATE = `# User Preferences
- **Default symbol**:
- **Language**:
- **Timezone**:
`;

// ---------------------------------------------------------------------------
// Vector store (shared process-wide singleton)
// ---------------------------------------------------------------------------

type EnvRecord = NodeJS.ProcessEnv | ResolveModelEnv | Record<string, string | undefined>;

function libsqlVectorUrl(env: EnvRecord = process.env): string {
  const configured = (env as Record<string, string | undefined>).MASTRA_LIBSQL_URL;
  if (configured && configured.length > 0) return configured;
  return 'file:./.kestrel/mastra.db';
}

/**
 * Create the vector store for semantic recall, mirroring `createMastraStorage`
 * selection so dev (LibSQL file) and prod (Postgres + pgvector) stay aligned.
 */
export function createKestrelVectorStore(
  kind?: MastraStorageKind,
  env: EnvRecord = process.env,
): MastraVector {
  const processEnv = env as NodeJS.ProcessEnv;
  const resolvedKind = kind ?? resolveMastraStorageKind(processEnv);
  if (resolvedKind === 'postgres') {
    const connectionString = mastraRuntimeConnectionString(processEnv);
    if (!connectionString) {
      throw new Error(
        '[mastra-memory] vector store requires DATABASE_URL, POSTGRES_URL, DIRECT_URL, ' +
          'or POSTGRES_URL_NON_POOLING to be set.',
      );
    }
    const poolMax = Number(processEnv.MASTRA_VECTOR_POOL_MAX ?? '3');
    return new PgVector({
      id: 'kestrel-mastra-vector',
      connectionString,
      schemaName: (env as Record<string, string | undefined>).MASTRA_SCHEMA ?? 'mastra',
      ssl: mastraSslOptions(processEnv),
      max: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 3,
      idleTimeoutMillis: 20_000,
      pgPoolOptions: { connectionTimeoutMillis: 10_000 },
    });
  }
  const url = libsqlVectorUrl(env);
  ensureLibsqlParent(url);
  return new LibSQLVector({ id: 'kestrel-mastra-vector', url });
}

const globalForVectorStore = globalThis as unknown as {
  __kestrelMastraVectorStore?: MastraVector | null;
};

/** Process-wide vector-store singleton (created lazily, HMR-safe). */
export function getKestrelVectorStore(
  kind?: MastraStorageKind,
  env: EnvRecord = process.env,
): MastraVector {
  globalForVectorStore.__kestrelMastraVectorStore ??= createKestrelVectorStore(kind, env);
  return globalForVectorStore.__kestrelMastraVectorStore;
}

/** Test helper — resets the singleton so tests can inject isolated stores. */
export function _resetKestrelVectorStore(): void {
  globalForVectorStore.__kestrelMastraVectorStore = null;
}

/** Close the shared vector-store pool (graceful shutdown / tests). */
export async function closeKestrelVectorStore(): Promise<void> {
  const store = globalForVectorStore.__kestrelMastraVectorStore;
  if (!store) return;
  const disconnectable = store as MastraVector & { disconnect?: () => Promise<void> };
  if (typeof disconnectable.disconnect === 'function') {
    await disconnectable.disconnect();
    mlog.info('Kestrel vector store pool closed');
  }
  globalForVectorStore.__kestrelMastraVectorStore = null;
}

// ---------------------------------------------------------------------------
// BYOK embedder
// ---------------------------------------------------------------------------

export interface KestrelEmbedderArgs {
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>;
  env: ResolveModelEnv;
}

/**
 * Wrap Kestrel's `embedTexts` (BYOK resolver + AI Gateway) as an AI SDK v5
 * EmbeddingModel so Mastra's semantic recall uses the user's own embedding
 * provider and key. Resolution priority is unchanged: user embeddingModel →
 * env.AI_EMBEDDING_MODEL → default.
 */
export function createKestrelEmbedder(args: KestrelEmbedderArgs): MastraEmbeddingModel<string> {
  const modelId = resolveEmbeddingModel(args.settings, args.env);
  const provider = modelId.split('/')[0] ?? 'kestrel-byok';
  return {
    specificationVersion: 'v2',
    provider,
    modelId,
    maxEmbeddingsPerCall: 256,
    supportsParallelCalls: false,
    async doEmbed({ values, abortSignal }) {
      const result = await embedTexts({
        texts: values,
        userSettings: args.settings,
        ...(args.env.AI_EMBEDDING_MODEL
          ? { env: { AI_EMBEDDING_MODEL: args.env.AI_EMBEDDING_MODEL } }
          : {}),
        ...(abortSignal ? { signal: abortSignal } : {}),
      });
      return {
        embeddings: result.embeddings,
        ...(result.inputTokens > 0 ? { usage: { tokens: result.inputTokens } } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Memory options
// ---------------------------------------------------------------------------

export interface KestrelMemoryOptionsArgs {
  env: ResolveModelEnv;
  /**
   * Force observational memory on regardless of the env var. Used by the
   * worker's durable Full-mode path where the process is long-lived and
   * background observation agents are appropriate.
   */
  forceObservationalMemory?: boolean;
  /**
   * Capability-specific semantic recall override (Phase 9). When provided it
   * is ANDed with the global `ENABLE_MASTRA_SEMANTIC_RECALL` gate: an
   * operator setting that gate to `false` is a hard kill switch for every
   * path, while a capability may still opt out when the gate is on.
   */
  semanticRecall?: boolean;
}

/**
 * The memory configuration for Kestrel agents.
 *
 * - lastMessages: 20 recent messages from the current thread.
 * - workingMemory: resource-scoped markdown preferences (seeded once from
 *   Drizzle; agent-maintained afterwards).
 * - semanticRecall: on by default; scope 'thread' so recall is strictly bounded
 *   to the current conversation thread, avoiding cross-thread setup bleed.
 *   Per-capability overrides come through `semanticRecall`; the global gate
 *   `ENABLE_MASTRA_SEMANTIC_RECALL` defaults to on but is a hard off switch:
 *   setting it to `false` disables recall even when a capability asks for it.
 * - observationalMemory: off by default; enable with
 *   `ENABLE_MASTRA_OBSERVATIONAL_MEMORY=true` on long-lived paths (thread-scoped).
 */
export function kestrelMemoryOptions(args: KestrelMemoryOptionsArgs): MemoryConfigInternal {
  const operatorRecallEnabled = (process.env.ENABLE_MASTRA_SEMANTIC_RECALL ?? 'true') !== 'false';
  const recallEnabled = operatorRecallEnabled && (args.semanticRecall ?? true);
  const semanticRecall = recallEnabled
    ? {
        topK: KESTREL_MEMORY_SEMANTIC_TOP_K,
        messageRange: { before: 1, after: 1 } as const,
        scope: 'thread' as const,
      }
    : false;
  const observationalMemory =
    args.forceObservationalMemory === true ||
    process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY === 'true'
      ? { scope: 'thread' as const }
      : false;
  return {
    lastMessages: KESTREL_MEMORY_LAST_MESSAGES,
    workingMemory: {
      enabled: true,
      scope: 'resource' as const,
      template: KESTREL_WORKING_MEMORY_TEMPLATE,
    },
    semanticRecall,
    observationalMemory,
  };
}

// ---------------------------------------------------------------------------
// Memory factory
// ---------------------------------------------------------------------------

export interface CreateKestrelMemoryArgs extends KestrelEmbedderArgs {
  /** Shared Phase 0 storage composite. Defaults to the Mastra instance's. */
  storage?: MastraCompositeStore;
  /** Shared vector store. Defaults to the process-wide singleton. */
  vector?: MastraVector;
  options?: MemoryConfigInternal;
}

/**
 * Build a per-request Memory instance over the shared storage/vector with a
 * BYOK embedder. The instance is cheap (config + shared stores); agents are
 * per-request too, so this matches the existing lifecycle.
 *
 * Storage defaults to the shared Kestrel Mastra instance's composite store so
 * the Memory never falls back to Mastra's ephemeral `file:memory.db` default.
 */
export function createKestrelMemory(args: CreateKestrelMemoryArgs): Memory {
  const km = getKestrelMastra();
  const vector = args.vector ?? getKestrelVectorStore(km.storageKind, args.env);
  const options = args.options ?? kestrelMemoryOptions({ env: args.env });
  const storage = args.storage ?? km.instance.getStorage();
  if (!storage) {
    throw new Error(
      '[mastra-memory] no storage available: configure Mastra storage on the shared ' +
        'instance (createKestrelMastra) or pass an explicit storage composite.',
    );
  }
  mlog.debug('Building Kestrel Memory instance', {
    embedderModel: resolveEmbeddingModel(args.settings, args.env),
    lastMessages: options?.lastMessages,
    semanticRecall: Boolean((options as { semanticRecall?: unknown })?.semanticRecall),
    workingMemory: Boolean((options as { workingMemory?: unknown })?.workingMemory),
  });
  return new Memory({
    storage,
    vector,
    embedder: createKestrelEmbedder(args),
    options,
  });
}
