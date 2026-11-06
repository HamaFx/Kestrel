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

// Embed + upsert core shared by every `remember*` writer.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import type { Symbol } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { eq } from 'drizzle-orm';

import { dailySpendUsd } from '../../budget/budget-spend';
import { embedTexts } from '../../models/embeddings';
import { getDb } from '../../runtime/db';
import type { EmbedEnv, EmbedUserSettings, MemoryKind } from './types';

const mlog = createCategorizedLogger('ai', { component: 'memory-upsert' });

/**
 * Resolve the BYOK key slice for embedding. `rememberJournalEntry` and
 * `rememberBriefing` only know the user id, so without this lookup a BYOK
 * user's embeddings silently fall back to operator env keys and fail with
 * `embed_failed`.
 */
async function loadEmbedSettings(userId: string): Promise<EmbedUserSettings | undefined> {
  try {
    const [row] = await getDb()
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        embeddingModel: schema.userSettings.embeddingModel,
      })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .limit(1);
    return row ?? undefined;
  } catch (err) {
    mlog.warn('memory user settings lookup failed', { userId, err: String(err) });
    return undefined;
  }
}

/**
 * Embed `text` and upsert into `memory_embeddings`. Skips silently when
 * the daily AI budget is exhausted. Idempotent on (kind, sourceId).
 */
export async function upsertMemory(args: {
  kind: MemoryKind;
  sourceId: string;
  symbol: Symbol | null;
  text: string;
  meta: unknown;
  occurredAt: Date;
  /** The owning user. Required for every user-generated memory. */
  userId: string;
  /** Tenant boundary; personal deployments use the user id. */
  tenantId?: string;
  env?: Partial<EmbedEnv>;
  /**
   * Phase D2 — user's embedding model pick. When supplied, takes
   * precedence over env.AI_EMBEDDING_MODEL.
   */
  userSettings?: EmbedUserSettings;
  signal?: AbortSignal | null;
}): Promise<{ stored: boolean; reason?: string }> {
  const text = args.text.trim();
  if (text.length === 0) return { stored: false, reason: 'empty' };

  const env = args.env ?? {};
  if (env.MAX_DAILY_USD !== undefined) {
    try {
      // Phase 3 §3.11 — require a real userId; no __system__ fallback.
      // If userId is missing, skip the budget check rather than attributing
      // spend to a phantom user.
      if (args.userId) {
        const spent = await dailySpendUsd(args.userId);
        if (spent >= env.MAX_DAILY_USD) return { stored: false, reason: 'budget' };
      }
    } catch {
      // proceed — budget probe failed; the chat-level guardrail still applies.
    }
  }

  let embedding: number[];
  let model: string;
  try {
    const userSettings = args.userSettings ?? (await loadEmbedSettings(args.userId));
    const result = await embedTexts({
      texts: [text],
      ...(userSettings ? { userSettings } : {}),
      ...(env.AI_EMBEDDING_MODEL ? { env: { AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL } } : {}),
      ...(args.signal ? { signal: args.signal } : {}),
    });
    const e = result.embeddings[0];
    if (!e) return { stored: false, reason: 'no_embedding' };
    embedding = e;
    model = result.model;
  } catch {
    return { stored: false, reason: 'embed_failed' };
  }

  if (args.signal?.aborted) return { stored: false, reason: 'aborted' };

  const db = getDb();
  const tenantId = await requireTenantIdForUser(args.userId, db);
  // Atomic upsert (Phase 1 hardening §8). The previous DELETE + INSERT
  // pair left rows missing forever if the process crashed between the
  // two statements, and concurrent re-embeddings of the same source
  // could collide on the unique constraint. The single `ON CONFLICT`
  // statement keeps the insert and the body refresh in one transaction
  // and matches the (user_id, kind, source_id) unique key (Phase 3 §14).
  // Resolve tenant membership before the insert so the persisted tenant is
  // canonical even when the caller supplies an optional tenant hint.
  const effectiveUserId = args.userId;
  if (args.tenantId !== undefined && args.tenantId !== tenantId) {
    throw new Error('Memory tenant does not match the user membership.');
  }
  const effectiveTenantId = tenantId;

  await db
    .insert(schema.memoryEmbeddings)
    .values({
      userId: effectiveUserId,
      tenantId: effectiveTenantId,
      kind: args.kind,
      sourceId: args.sourceId,
      symbol: args.symbol,
      text,
      model,
      embedding,
      meta: args.meta as never,
      occurredAt: args.occurredAt,
    })
    .onConflictDoUpdate({
      target: [
        schema.memoryEmbeddings.userId,
        schema.memoryEmbeddings.kind,
        schema.memoryEmbeddings.sourceId,
      ],
      set: {
        symbol: args.symbol,
        text,
        model,
        embedding,
        meta: args.meta as never,
        occurredAt: args.occurredAt,
        userId: effectiveUserId,
        tenantId: effectiveTenantId,
        // createdAt stays at the original insert time — pgvector cosine
        // results don't depend on it, and consumers prefer the original
        // ingestion timestamp for audit trails.
      },
    });

  return { stored: true };
}
