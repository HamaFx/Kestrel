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

// Live + completion tool-event mapping for the custom-agent stream.

import type { CustomAgentStreamResult } from '@kestrel/ai/plugins';
import type { ChatStreamEvent } from '@kestrel/shared';

export type CustomAgentCompletion = Awaited<CustomAgentStreamResult['completion']>;
export type CustomAgentToolPart = CustomAgentCompletion['toolParts'][number];

export interface LiveToolEvent {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export function toolEventToStreamEvent(event: LiveToolEvent): ChatStreamEvent | null {
  if (event.state === 'input-available' || event.state === 'input-streaming') {
    return {
      type: 'tool-input-available',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input ?? null,
    };
  }
  if (event.state === 'output-available') {
    return {
      type: 'tool-output-available',
      toolCallId: event.toolCallId,
      output: event.output ?? null,
    };
  }
  if (event.state === 'output-error') {
    return {
      type: 'tool-output-error',
      toolCallId: event.toolCallId,
      errorText: event.errorText ?? 'Tool execution failed.',
    };
  }
  return null;
}

/** Emit completion-time tool parts that did not already stream live. */
export function pushCustomToolPartEvents(
  toolParts: CustomAgentToolPart[],
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
