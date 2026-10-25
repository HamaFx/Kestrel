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

// Per-user strategy knowledge base.
//
// Documents live in `plugin_storage` (zero-migration JSON) under the
// `knowledge` collection. They are not Mastra global skills — Mastra skills
// are resolved once per process — so the playbooks skill teaches the agent to
// call `backtest_knowledge_read` before designing a strategy. This keeps
// user-authored notes private and immediately available.

import type { PluginExecutionContext } from '@kestrel/plugin-sdk';

import {
  slugifyName,
  type KnowledgeDocumentSummary,
  type KnowledgeReadOutput,
  type KnowledgeSaveInput,
} from './schemas';

const COLLECTION = 'knowledge';
const MAX_DOCUMENTS = 100;

interface StoredKnowledgeDocument {
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
}

function isDocument(value: unknown): value is StoredKnowledgeDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['title'] === 'string' &&
    typeof record['content'] === 'string' &&
    Array.isArray(record['tags']) &&
    typeof record['updatedAt'] === 'string'
  );
}

export async function listKnowledge(
  ctx: PluginExecutionContext,
): Promise<KnowledgeDocumentSummary[]> {
  const entries = await ctx.storage.list(COLLECTION);
  const documents: KnowledgeDocumentSummary[] = [];
  for (const entry of entries) {
    if (!isDocument(entry.value)) continue;
    documents.push({
      key: entry.key,
      title: entry.value.title,
      tags: entry.value.tags,
      updatedAt: entry.value.updatedAt,
      chars: entry.value.content.length,
    });
  }
  return documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_DOCUMENTS);
}

export async function readKnowledge(
  ctx: PluginExecutionContext,
  key: string,
): Promise<KnowledgeReadOutput | null> {
  const value = await ctx.storage.get<StoredKnowledgeDocument>(COLLECTION, key);
  if (!isDocument(value)) return null;
  return {
    key,
    title: value.title,
    content: value.content,
    tags: value.tags,
    updatedAt: value.updatedAt,
  };
}

export async function saveKnowledge(
  ctx: PluginExecutionContext,
  input: KnowledgeSaveInput,
): Promise<{ key: string; title: string; content: string }> {
  const key = input.key ?? slugifyName(input.title);
  if (!key) throw new Error('Could not derive a kebab-case key from the title.');
  const existing = await listKnowledge(ctx);
  if (!existing.some((doc) => doc.key === key) && existing.length >= MAX_DOCUMENTS) {
    throw new Error(
      `The knowledge base already holds ${MAX_DOCUMENTS} documents. Delete one before adding another.`,
    );
  }

  const document: StoredKnowledgeDocument = {
    title: input.title.slice(0, 160),
    content: input.content,
    tags: (input.tags ?? []).slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  await ctx.storage.set(COLLECTION, key, document);
  return { key, title: document.title, content: document.content };
}

export async function deleteKnowledge(ctx: PluginExecutionContext, key: string): Promise<boolean> {
  const existing = await ctx.storage.get(COLLECTION, key);
  if (existing === null) return false;
  await ctx.storage.delete(COLLECTION, key);
  return true;
}
