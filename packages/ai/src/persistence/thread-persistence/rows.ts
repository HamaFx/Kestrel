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

// Thread row → DTO mapping.

import type { schema } from '@kestrel/db';
import type { Symbol } from '@kestrel/shared';

import type { DbThread } from './types';

export function rowToThread(row: typeof schema.chatThreads.$inferSelect): DbThread {
  const rawSource = row.titleSource;
  const titleSource: DbThread['titleSource'] =
    rawSource === 'llm' || rawSource === 'fallback' ? rawSource : null;
  return {
    id: row.id,
    title: row.title,
    titleSource,
    pinnedSymbol: row.pinnedSymbol as Symbol | null,
    modelOverride: row.modelOverride,
    analysisMode: row.analysisMode,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
