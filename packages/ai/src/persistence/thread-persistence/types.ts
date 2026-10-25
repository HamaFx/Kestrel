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

// P1 — Thread persistence contracts (SRP split from persistence.ts).

import type { DbClient } from '@kestrel/db';
import type { Symbol } from '@kestrel/shared';

/** Drizzle transaction client handed to `db.transaction` callbacks. */
export type ThreadTx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export interface DbThread {
  id: string;
  title: string | null;
  /**
   * Provenance of `title`: `'llm'` = produced by `Title_Generator`,
   * `'fallback'` = deterministic local fallback, `null` = legacy row created
   * before the `title_source` column existed.
   */
  titleSource: 'llm' | 'fallback' | null;
  pinnedSymbol: Symbol | null;
  modelOverride: string | null;
  analysisMode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadCursor {
  updatedAt: number;
  id?: string;
}

export interface ForkThreadInput {
  userId: string;
  sourceThreadId: string;
  atMessageId: string;
  newText: string;
}

export interface ForkThreadResult {
  newThreadId: string;
  firstMessage: { id: string; role: 'user'; content: string };
}
