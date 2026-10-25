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

// Briefing persistence (DEC-05 split from generate.ts): append the
// assistant message that carries the `briefing` part marker and embed the
// body into the memory index. The first user message in any briefing thread
// is irrelevant — we directly append assistant messages so the chat UI can
// recognise them later.

import type { BriefingMessagePart, Symbol } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { rememberBriefing } from '../../memory/memory-index';
import { appendAssistantMessage } from '../../persistence';
import { blog } from './env';

export async function appendBriefingMessage(
  userId: string,
  threadId: string,
  summary: string,
  briefingPart: BriefingMessagePart,
): Promise<{ messageId: string }> {
  const ui = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    parts: [{ type: 'text' as const, text: summary }, briefingPart],
  };
  return appendAssistantMessage(userId, threadId, ui as UIMessage);
}

/**
 * Phase 7b — embed the briefing into the memory index so it's surfaceable
 * later via `search_knowledge`. Best-effort: failures are logged and never
 * block the emit path.
 */
export function embedBriefingInMemory(args: {
  messageId: string;
  body: string;
  briefingKind: 'pre' | 'post' | 'weekly_review';
  occurredAtMs: number;
  userId: string;
  symbol?: Symbol | undefined;
}): void {
  void rememberBriefing({
    messageId: args.messageId,
    body: args.body,
    briefingKind: args.briefingKind,
    occurredAtMs: args.occurredAtMs,
    userId: args.userId,
    ...(args.symbol ? { symbol: args.symbol } : {}),
  }).catch((err) => blog.warn('memory write failed', { err: String(err) }));
}
