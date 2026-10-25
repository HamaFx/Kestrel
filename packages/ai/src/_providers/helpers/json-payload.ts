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

// Non-streaming HCNSEC chat-completion normalization.

import { normalizeHcnsecDsmlToolCalls } from './dsml';
import { normalizeHcnsecToolArguments } from './tool-arguments';

/** Normalize a non-streaming HCNSEC chat-completion payload. */
export function normalizeHcnsecJsonPayload(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const payload = input as Record<string, unknown>;
  if (!Array.isArray(payload.choices)) return input;
  const choices = payload.choices as unknown[];
  let changed = false;
  const normalizedChoices = choices.map((rawChoice) => {
    if (!rawChoice || typeof rawChoice !== 'object') return rawChoice;
    const choice = rawChoice as Record<string, unknown>;
    const message = choice.message;
    if (!message || typeof message !== 'object') return rawChoice;
    const messageRecord = message as Record<string, unknown>;
    const existingToolCalls = Array.isArray(messageRecord.tool_calls)
      ? messageRecord.tool_calls
      : null;
    if (existingToolCalls) {
      const toolCalls = existingToolCalls.map((rawCall) => {
        if (!rawCall || typeof rawCall !== 'object') return rawCall;
        const call = rawCall as Record<string, unknown>;
        const fn =
          call.function && typeof call.function === 'object'
            ? (call.function as Record<string, unknown>)
            : null;
        if (!fn || typeof fn.name !== 'string' || typeof fn.arguments !== 'string') return rawCall;
        return {
          ...call,
          function: {
            ...fn,
            arguments: normalizeHcnsecToolArguments(fn.name, fn.arguments),
          },
        };
      });
      changed = true;
      return { ...choice, message: { ...messageRecord, tool_calls: toolCalls } };
    }
    if (typeof messageRecord.content !== 'string') return rawChoice;
    const normalized = normalizeHcnsecDsmlToolCalls(messageRecord.content);
    if (!normalized) return rawChoice;
    changed = true;
    return {
      ...choice,
      finish_reason: 'tool_calls',
      message: {
        ...messageRecord,
        content: normalized.content || null,
        tool_calls: normalized.toolCalls,
      },
    };
  });
  return changed ? { ...payload, choices: normalizedChoices } : input;
}
