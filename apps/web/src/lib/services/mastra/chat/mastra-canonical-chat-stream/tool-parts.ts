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

// Tool-part extraction for the canonical Mastra stream: emit any tool parts
// discovered from completion messages that were not already emitted live.

import type { MastraCanonicalChatStream } from '@kestrel/ai/mastra-v2';
import type { ChatStreamEvent } from '@kestrel/shared';

export type CanonicalCompletion = Awaited<MastraCanonicalChatStream['completion']>;
export type CanonicalToolPart = NonNullable<CanonicalCompletion['toolParts']>[number];

export function pushCanonicalToolPartEvents(
  toolParts: CanonicalToolPart[],
  emittedToolCallIds: Set<string>,
  postTextEvents: ChatStreamEvent[],
): void {
  for (const tp of toolParts) {
    if (!emittedToolCallIds.has(tp.toolCallId)) {
      emittedToolCallIds.add(tp.toolCallId);
      postTextEvents.push({
        type: 'tool-input-available',
        toolCallId: tp.toolCallId,
        toolName: tp.toolName,
        input: tp.input,
      });
      if (tp.state === 'output-available') {
        postTextEvents.push({
          type: 'tool-output-available',
          toolCallId: tp.toolCallId,
          output: tp.output ?? null,
        });
      } else if (tp.state === 'output-error') {
        postTextEvents.push({
          type: 'tool-output-error',
          toolCallId: tp.toolCallId,
          errorText: tp.errorText ?? 'Tool execution failed.',
        });
      }
    }
  }
}
