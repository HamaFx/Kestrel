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

// RAG contracts and tuning constants (DEC-05 split of rag.ts).

import type { Symbol } from '@kestrel/shared';

import type { JevEnv, JevSettings } from '../../jev/types';
import type {
  ContentScreenMode,
  ContentScreenReportSink,
} from '../../mastra-v2/packets/external-content';
import type { MemoryKind } from '../../memory/memory-index';

/** Exported for testing — RAG result row shape. */
export interface RagRow {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publisher: string | null;
  publishedAt: Date;
  sentiment: string | null;
  sentimentScore: number | null;
  similarity: number;
  /** Available only on FTS rows (Postgres ts_rank_cd). */
  ftsRank?: number;
}

export const DEFAULT_HALFLIFE_DAYS_NEWS = 7;
export const DEFAULT_HALFLIFE_DAYS_MEMORY = 30;

export interface RunRagQueryArgs {
  embedding: number[];
  limit: number;
  /** Embedding model id used to produce `embedding` — filters out vectors from other spaces. */
  model: string;
  /** Lexical query for FTS. Falls back to a simple to_tsquery if omitted. */
  query?: string;
  since?: number | undefined;
  symbol?: Symbol | undefined;
  /** Halflife in days for time-decay. */
  halflifeDays?: number;
  /**
   * Audit R15 — screening posture for the untrusted news snippets. Required:
   * research/untrusted callers pass `strict` (refuse unscreened snippets),
   * conversation callers may pass `availability`.
   */
  screenMode: ContentScreenMode;
  /**
   * Phase 2 (Jev) — settings/env for the snippet quarantine & rerank pass.
   * When both are omitted in `availability` mode the RRF result is returned
   * untouched (the deployer chose the uncalibrated path). `strict` never skips
   * the screen.
   */
  jevSettings?: JevSettings | null | undefined;
  jevEnv?: JevEnv | null | undefined;
  jevSignal?: AbortSignal | null | undefined;
  /** Test seam / custom transport for the screening batch. Defaults to global fetch. */
  jevFetchImpl?: typeof fetch | undefined;
  /** Run context that receives the screening event. */
  reportSink?: ContentScreenReportSink | null | undefined;
}

export interface RunMemoryQueryArgs {
  embedding: number[];
  limit: number;
  kinds: MemoryKind[];
  /** Embedding model id — restricts recall to the same embedding space. */
  model?: string;
  since?: number | undefined;
  symbol?: Symbol | undefined;
  halflifeDays?: number;
  userId: string;
  /** Recall query text carried into the screening batch. */
  query?: string | undefined;
  /**
   * Audit R15 — screening posture for recalled memory text. Memory can hold
   * pasted external prose (journal notes, thread synopses), so it gets the
   * same strict/availability treatment as news retrieval.
   */
  screenMode: ContentScreenMode;
  jevSettings?: JevSettings | null | undefined;
  jevEnv?: JevEnv | null | undefined;
  jevSignal?: AbortSignal | null | undefined;
  /** Run context that receives the screening event. */
  reportSink?: ContentScreenReportSink | null | undefined;
}
