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

// Briefing writer for the memory index.

import type { Symbol } from '@kestrel/shared';

import type { EmbedEnv } from './types';
import { upsertMemory } from './upsert';

export interface RememberBriefingArgs {
  messageId: string;
  body: string;
  /** Optional symbol scope. */
  symbol?: Symbol | null;
  /** Briefing kind ('pre' | 'post' | 'weekly_review'). */
  briefingKind: string;
  occurredAtMs?: number;
  env?: Partial<EmbedEnv>;
  /** The owning user. Required for proper tenant isolation. */
  userId: string;
  signal?: AbortSignal | null;
}

export async function rememberBriefing(
  args: RememberBriefingArgs,
): Promise<{ stored: boolean; reason?: string }> {
  return upsertMemory({
    kind: 'briefing',
    sourceId: args.messageId,
    symbol: args.symbol ?? null,
    text: args.body,
    meta: { briefingKind: args.briefingKind },
    occurredAt: new Date(args.occurredAtMs ?? Date.now()),
    ...(args.env ? { env: args.env } : {}),
    userId: args.userId,
    ...(args.signal ? { signal: args.signal } : {}),
  });
}
