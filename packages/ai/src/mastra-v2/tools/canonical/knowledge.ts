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
 * B-01 (audit 2026-10-18, I-03) — native Mastra registration of
 * `search_knowledge`.
 *
 * Phase 7b — hybrid retrieval over the news corpus PLUS optional recall
 * against the memory index (journal, briefings, thread synopses):
 *
 *   1. Dense cosine over `news_embeddings`.
 *   2. Postgres FTS over `news_articles.title || summary`.
 *   3. Reciprocal-rank fusion of (1) + (2), then time-decayed by a
 *      configurable halflife.
 *   4. When `kinds` includes any non-`news` value, the memory index is
 *      queried with the same embedding and the rows are RRF-fused into
 *      the final ranking.
 *
 * The agent uses this for "what's been said about X recently" (news) and
 * for "have we journaled anything similar" (memory). Empty corpora are
 * surfaced via `pipelinePending: true` so the chat part can show a helpful
 * status line instead of a misleading "no results".
 */

import type { SearchKnowledgeOutput } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { type z } from 'zod';

import { countMemory, type MemoryKind } from '@ai/memory/memory-index';
import {
  countEmbeddings,
  embedQuery,
  memoryRowToItem,
  ragRowToItem,
  runMemoryQuery,
  runRagQuery,
} from '@ai/models/rag';
import { maybeGetToolContext } from '@ai/runtime/tool-context';

import { createReadOnlyToolExecute } from '../../agents/xauusd/legacy-tool-adapter';
import { CANONICAL_KNOWLEDGE_DESCRIPTION } from './descriptions';
import { CanonicalKnowledgeInputSchema } from './input-schemas';

// Leaf re-exports: the values live in modules with no app-graph imports, so a
// module-scope read (legacy shims, other consumers) can never land on a binding
// that is still initialising inside the instance ↔ tools import cycle.
export { CANONICAL_KNOWLEDGE_DESCRIPTION, CanonicalKnowledgeInputSchema };

export type CanonicalKnowledgeInput = z.infer<typeof CanonicalKnowledgeInputSchema>;

const FALLBACK_MODEL = 'openai/text-embedding-3-small';

/** Shared execute core: news + memory hybrid retrieval with RRF fusion. */
export async function executeCanonicalKnowledge(
  input: CanonicalKnowledgeInput,
): Promise<SearchKnowledgeOutput> {
  const { query, since, symbol, limit, kinds, halflifeDays } = input;
  const kindSet = new Set<string>(kinds ?? ['news']);
  const wantsNews = kindSet.has('news');
  const memoryKinds: MemoryKind[] = (kinds ?? []).filter(
    (k): k is MemoryKind => k === 'journal' || k === 'briefing' || k === 'thread_synopsis',
  );

  if (!wantsNews && memoryKinds.length === 0) {
    // Nothing to search — defensive default, the input schema's enum
    // already rules out empty `kinds`.
    return { items: [], model: FALLBACK_MODEL, pipelinePending: true };
  }

  const ctx = maybeGetToolContext();
  const memoryUserId = memoryKinds.length > 0 ? ctx?.userId : undefined;
  if (memoryKinds.length > 0 && !memoryUserId) {
    return { items: [], model: FALLBACK_MODEL, pipelinePending: true };
  }

  // Probe corpora before paying for an embed call when both are empty.
  const [newsCount, memoryCount] = await Promise.all([
    wantsNews ? countEmbeddings() : Promise.resolve(0),
    memoryUserId ? countMemory(memoryUserId, memoryKinds) : Promise.resolve(0),
  ]);
  if (
    (wantsNews && newsCount === 0 && memoryKinds.length === 0) ||
    (memoryKinds.length > 0 && memoryCount === 0 && !wantsNews)
  ) {
    return { items: [], model: FALLBACK_MODEL, pipelinePending: true };
  }

  const { embedding, model } = await embedQuery(query, {
    ...(ctx?.userSettings
      ? {
          userSettings: {
            aiApiKeys: ctx.userSettings.aiApiKeys,
            embeddingModel: ctx.userSettings.embeddingModel,
          },
        }
      : {}),
    ...(ctx?.env?.AI_EMBEDDING_MODEL ? { aiEmbeddingModel: ctx.env.AI_EMBEDDING_MODEL } : {}),
    ...(ctx?.signal ? { signal: ctx.signal } : {}),
  });

  const [newsRows, memoryRows] = await Promise.all([
    wantsNews && newsCount > 0
      ? runRagQuery({
          embedding,
          model,
          limit,
          query,
          ...(since !== undefined ? { since } : {}),
          ...(symbol !== undefined ? { symbol } : {}),
          ...(halflifeDays !== undefined ? { halflifeDays } : {}),
        })
      : Promise.resolve([]),
    memoryKinds.length > 0 && memoryCount > 0
      ? runMemoryQuery({
          embedding,
          model,
          limit,
          kinds: memoryKinds,
          userId: memoryUserId!,
          ...(since !== undefined ? { since } : {}),
          ...(symbol !== undefined ? { symbol } : {}),
          ...(halflifeDays !== undefined ? { halflifeDays: halflifeDays * 4 } : {}),
        })
      : Promise.resolve([]),
  ]);

  const merged = [...newsRows.map(ragRowToItem), ...memoryRows.map(memoryRowToItem)].sort(
    (a, b) => b.similarity - a.similarity,
  );

  return {
    items: merged.slice(0, limit),
    model,
    pipelinePending: merged.length === 0,
  };
}

export const canonicalKnowledgeTool = createTool({
  id: 'kestrel-search_knowledge',
  description: CANONICAL_KNOWLEDGE_DESCRIPTION,
  inputSchema: CanonicalKnowledgeInputSchema,
  execute: createReadOnlyToolExecute<CanonicalKnowledgeInput, SearchKnowledgeOutput>(
    'kestrel-search_knowledge',
    'search_knowledge',
    (input) => executeCanonicalKnowledge(input),
  ),
});
