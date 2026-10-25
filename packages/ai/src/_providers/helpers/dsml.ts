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

// DeepSeek DSML tool-call parsing.

import { normalizeHcnsecToolArguments } from './tool-arguments';
import type { HcnsecToolCall } from './types';

/**
 * Parse DeepSeek's DSML tool-call format when HCNSEC returns it as text.
 *
 * Some HCNSEC/DeepSeek responses use:
 * `<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="get_price">...`
 * instead of OpenAI-compatible `message.tool_calls`. Converting it at
 * the provider boundary lets the AI SDK execute the registered tools and
 * keeps the rest of the agent pipeline provider-agnostic.
 */
export function normalizeHcnsecDsmlToolCalls(input: string): {
  content: string;
  toolCalls: HcnsecToolCall[];
} | null {
  const dsml = '｜｜DSML｜｜';
  const startTag = `<${dsml}tool_calls>`;
  const endTag = `</${dsml}tool_calls>`;
  const start = input.indexOf(startTag);
  if (start < 0) return null;
  const end = input.indexOf(endTag, start + startTag.length);
  if (end < 0) return null;

  const body = input.slice(start + startTag.length, end);
  const invokePattern = new RegExp(
    `<${dsml}invoke\\s+name="([^"]+)"\\s*>([\\s\\S]*?)</${dsml}invoke>`,
    'g',
  );
  const parameterPattern = new RegExp(
    `<${dsml}parameter\\s+name="([^"]+)"(?:\\s+string="([^"]+)")?\\s*>([\\s\\S]*?)</${dsml}parameter>`,
    'g',
  );
  const toolCalls: HcnsecToolCall[] = [];
  let invoke: RegExpExecArray | null;
  while ((invoke = invokePattern.exec(body)) !== null) {
    const name = invoke[1]?.trim();
    if (!name) continue;
    const args: Record<string, unknown> = {};
    const parameters = invoke[2] ?? '';
    let parameter: RegExpExecArray | null;
    while ((parameter = parameterPattern.exec(parameters)) !== null) {
      const key = parameter[1]?.trim();
      if (!key) continue;
      const rawValue = (parameter[3] ?? '').trim();
      const isString = parameter[2] === 'true';
      if (isString) {
        args[key] = rawValue;
      } else {
        try {
          args[key] = JSON.parse(rawValue) as unknown;
        } catch {
          args[key] = rawValue;
        }
      }
    }
    toolCalls.push({
      id: `hcnsec-dsml-${toolCalls.length}`,
      type: 'function',
      function: {
        name,
        arguments: normalizeHcnsecToolArguments(name, JSON.stringify(args)),
      },
    });
  }

  if (toolCalls.length === 0) return null;
  const content = `${input.slice(0, start)}${input.slice(end + endTag.length)}`.trim();
  return { content, toolCalls };
}
