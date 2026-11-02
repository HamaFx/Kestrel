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

// Completion-time tool parts for the shared Mastra SSE turn: emit any part the
// stream did not already deliver live, deduplicated by tool-call id.

import type { ChatStreamEvent } from '@kestrel/shared';

/** Minimal tool-part shape shared by all three completion payloads. */
export interface MastraSseToolPart {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/** Emit completion-time tool parts that did not already stream live. */
export function pushPendingToolPartEvents(
  toolParts: readonly MastraSseToolPart[],
  emittedToolCallIds: Set<string>,
  postTextEvents: ChatStreamEvent[],
): void {
  for (const part of toolParts) {
    if (emittedToolCallIds.has(part.toolCallId)) continue;
    emittedToolCallIds.add(part.toolCallId);
    postTextEvents.push({
      type: 'tool-input-available',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.input,
    });
    if (part.state === 'output-available') {
      postTextEvents.push({
        type: 'tool-output-available',
        toolCallId: part.toolCallId,
        output: part.output ?? null,
      });
    } else if (part.state === 'output-error') {
      postTextEvents.push({
        type: 'tool-output-error',
        toolCallId: part.toolCallId,
        errorText: part.errorText ?? 'Tool execution failed.',
      });
    }
  }
}
