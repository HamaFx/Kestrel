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

// ---------------------------------------------------------------------------
// Adapters (DEC-05 split of rag.ts): RAG/memory rows → the shared
// `SearchKnowledgeItem` DTO the chat part and tool outputs consume.
// ---------------------------------------------------------------------------

import { schema } from '@kestrel/db';
import type { NewsSentiment, SearchKnowledgeItem } from '@kestrel/shared';

import { quarantineExternalText } from '../../mastra-v2/packets/external-content';
import type { MemoryRow } from '../../memory/memory-index';
import { getDb } from '../../runtime/db';
import type { RagRow } from './types';

/** Cheap probe: does `news_embeddings` have any rows at all? */
export async function countEmbeddings(): Promise<number> {
  const rows = await getDb()
    .select({ id: schema.newsEmbeddings.articleId })
    .from(schema.newsEmbeddings)
    .limit(1);
  return rows.length;
}

/** Map a RAG row to the `SearchKnowledgeItem` DTO the tool returns. */
export function ragRowToItem(r: RagRow): SearchKnowledgeItem {
  const sentiment: NewsSentiment | null =
    r.sentiment === 'positive' || r.sentiment === 'negative' || r.sentiment === 'neutral'
      ? r.sentiment
      : null;
  const sim = Math.max(0, Math.min(1, r.similarity));
  return {
    id: r.id,
    title: quarantineExternalText(r.title, 240).text || '[filtered]',
    summary: r.summary ? quarantineExternalText(r.summary, 420).text || null : null,
    url: r.url,
    source: quarantineExternalText(r.source, 80).text || 'unknown',
    publisher: r.publisher ? quarantineExternalText(r.publisher, 80).text || null : null,
    publishedAt: r.publishedAt.getTime(),
    sentiment,
    sentimentScore: r.sentimentScore,
    similarity: sim,
  };
}

/**
 * Map a memory row to the `SearchKnowledgeItem` shape so the chat part
 * can render journal / briefing memories alongside news without a second
 * UI primitive. We synthesise a "title" from kind + symbol and use the
 * `text` body as the summary.
 */
export function memoryRowToItem(r: MemoryRow): SearchKnowledgeItem {
  const titleHead =
    r.kind === 'journal'
      ? `Journal · ${r.symbol ?? ''}`
      : r.kind === 'briefing'
        ? 'Briefing'
        : 'Thread synopsis';
  const sim = Math.max(0, Math.min(1, r.similarity));
  return {
    id: `mem:${r.id}`,
    title: titleHead.trim(),
    summary: r.text,
    // No outbound URL for memory rows — surface the journal/chat deep
    // link in the part renderer if needed.
    url: '',
    source: r.kind,
    publisher: null,
    publishedAt: r.occurredAtMs,
    sentiment: null,
    sentimentScore: null,
    similarity: sim,
  };
}
