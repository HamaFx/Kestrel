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

// Thread-synopsis writer for the memory index (`summarize_thread`).

import type { ThreadInsight } from '@kestrel/shared';

import type { EmbedEnv, EmbedUserSettings } from './types';
import { upsertMemory } from './upsert';

export interface RememberThreadSynopsisArgs {
  threadId: string;
  /** The authenticated owner of the source thread. */
  userId: string;
  synopsis: string;
  insights: ThreadInsight[];
  env?: Partial<EmbedEnv>;
  /** Phase D2 — user's embedding pick. */
  userSettings?: EmbedUserSettings;
  signal?: AbortSignal | null;
}

export async function rememberThreadSynopsis(
  args: RememberThreadSynopsisArgs,
): Promise<{ stored: boolean; reason?: string }> {
  const insightLines = args.insights.map((i) => `→ ${i.text}${i.symbol ? ` (${i.symbol})` : ''}`);
  const text = [args.synopsis, ...insightLines].join('\n').trim();
  return upsertMemory({
    kind: 'thread_synopsis',
    sourceId: args.threadId,
    userId: args.userId,
    symbol: null,
    text,
    meta: { insights: args.insights },
    occurredAt: new Date(),
    ...(args.env ? { env: args.env } : {}),
    ...(args.userSettings ? { userSettings: args.userSettings } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
}
