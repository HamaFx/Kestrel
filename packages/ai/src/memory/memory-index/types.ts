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

// Memory index contracts.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { ServerEnv, Symbol } from '@kestrel/shared';

export type MemoryKind = 'journal' | 'briefing' | 'thread_synopsis' | 'market_regime';

export interface MemoryRow {
  id: string;
  kind: MemoryKind;
  sourceId: string;
  symbol: Symbol | null;
  text: string;
  model: string;
  meta: unknown;
  similarity: number;
  occurredAtMs: number;
}

export type EmbedEnv = Pick<
  ServerEnv,
  'AI_GATEWAY_API_KEY' | 'GOOGLE_GENERATIVE_AI_API_KEY' | 'AI_EMBEDDING_MODEL' | 'MAX_DAILY_USD'
>;

/** Phase D2 — user-pickable embedding model slice. */
export type EmbedUserSettings = Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>;
