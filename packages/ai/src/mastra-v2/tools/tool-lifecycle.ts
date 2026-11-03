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

// Read-only tool lifecycle barrel (DEC-05 split, moved to tools/ in Phase 4):
// the Mastra lifecycle wrapper plus the stream-part parsing the canonical chat
// runner and specialist runner share.
//
//   - stream-parts.ts — UI tool-name mapping + `tool-<name>` part extraction
//
// The wrapper body stays in this module (the former module's surface) on
// purpose: `createReadOnlyToolExecute` is called at module scope by
// `mastra-v2/tools/canonical/*` and `mastra-v2/tools/read-only/*`, which sit
// inside the `shared/tool-telemetry` import cycle. Keeping the function
// declarations in the entry module preserves the original hoisting semantics;
// re-exporting them through a second hop would surface an undefined binding to
// those modules during cyclic evaluation.
//
// Phase 4 Task 2: the runtime `adaptLegacyReadOnlyTool(s)` duck-typing adapter
// is gone. Every read-only tool is registered explicitly as a native Mastra
// `createTool`; `executeLegacyReadOnlyTool` is the only bridge that calls an
// existing legacy execute core.

import type { ToolObserve } from '@mastra/core/tools';
import type { Tool, ToolExecutionOptions } from 'ai';

import { executeMastraTool } from '@ai/mastra-v2/shared/tool-telemetry';

import { type MastraToolInvocationPart, type MastraToolStreamEvent } from './tool-stream-parts';

/** Context Mastra hands to a read-only tool execute function. */
export interface MastraReadOnlyToolContext {
  toolCallId?: string;
  messages?: unknown[];
  abortSignal?: AbortSignal;
  requestContext?: { get: (key: string) => unknown };
  observe?: ToolObserve;
}

/**
 * B-01 (audit 2026-10-18): the single lifecycle wrapper for every read-only
 * Mastra tool. Emits live tool UI events, captures tool parts for the streamed
 * response, and records metrics/DB telemetry without logging inputs or outputs.
 */
export function createReadOnlyToolExecute<TInput, TOutput>(
  fullToolId: string,
  uiToolName: string,
  run: (input: TInput, context: MastraReadOnlyToolContext) => Promise<TOutput>,
  options?: { agentId?: string },
): (input: TInput, context: MastraReadOnlyToolContext) => Promise<TOutput> {
  return async (input: TInput, context: MastraReadOnlyToolContext) => {
    const toolCallId = context.toolCallId ?? `call-${uiToolName}-${crypto.randomUUID()}`;
    const onToolEvent = context.requestContext?.get('onToolEvent') as
      | ((event: MastraToolStreamEvent) => void)
      | undefined;
    const toolParts = context.requestContext?.get('toolParts') as
      | MastraToolInvocationPart[]
      | undefined;

    if (typeof onToolEvent === 'function') {
      try {
        onToolEvent({ type: 'tool-input-start', toolCallId, toolName: uiToolName });
        onToolEvent({ type: 'tool-input-available', toolCallId, toolName: uiToolName, input });
      } catch {
        // Tool event listeners must never break tool execution.
      }
    }

    try {
      const output = await executeMastraTool(
        fullToolId,
        context,
        // F7 parity: the shared wrapper hands back the effective context so
        // every read-only tool observes both parent cancellation and the
        // per-tool deadline through its own abort signal.
        (effectiveContext) => run(input, effectiveContext),
        options,
      );
      if (typeof onToolEvent === 'function') {
        try {
          onToolEvent({ type: 'tool-output-available', toolCallId, output });
        } catch {
          // Ignore listener errors.
        }
      }
      if (Array.isArray(toolParts)) {
        toolParts.push({
          type: `tool-${uiToolName}`,
          toolCallId,
          toolName: uiToolName,
          state: 'output-available',
          input,
          output,
        });
      }
      return output;
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      if (typeof onToolEvent === 'function') {
        try {
          onToolEvent({ type: 'tool-output-error', toolCallId, errorText });
        } catch {
          // Ignore listener errors.
        }
      }
      if (Array.isArray(toolParts)) {
        toolParts.push({
          type: `tool-${uiToolName}`,
          toolCallId,
          toolName: uiToolName,
          state: 'output-error',
          input,
          errorText,
        });
      }
      throw err;
    }
  };
}

/**
 * Minimal executable shape for the bridge. The AI SDK `Tool` is a union of
 * function/provider/dynamic tools, so the bridge narrows to the executable
 * surface it actually expects (the legacy tools are all `tool()` values).
 */
interface ExecutableLegacyReadOnlyTool<TInput, TOutput> {
  execute: (
    input: TInput,
    options: {
      toolCallId: string;
      messages: ToolExecutionOptions<unknown>['messages'];
      abortSignal?: AbortSignal;
      context?: unknown;
    },
  ) => PromiseLike<TOutput> | TOutput | AsyncIterable<TOutput>;
}

function isAsyncIterable<TOutput>(value: unknown): value is AsyncIterable<TOutput> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  );
}

/**
 * Invoke an existing Kestrel read-only tool without duplicating its
 * deterministic implementation. This is the single bridge from a native
 * Mastra registration to the AI SDK tool implementation.
 *
 * The legacy executes read only `context.abortSignal` (verified across
 * `packages/ai/src/tools/*`); `toolCallId` and `messages` are forwarded when
 * present so a future implementation can still see them.
 */
export async function executeLegacyReadOnlyTool<TInput, TOutput>(
  legacyTool: Tool<TInput, TOutput>,
  input: TInput,
  context?: Pick<MastraReadOnlyToolContext, 'toolCallId' | 'messages' | 'abortSignal'>,
): Promise<TOutput> {
  const executable = legacyTool as unknown as ExecutableLegacyReadOnlyTool<TInput, TOutput>;
  if (typeof executable.execute !== 'function') {
    throw new Error('Read-only tool bridge received a legacy tool without an execute function');
  }
  const result = executable.execute(input, {
    toolCallId: context?.toolCallId ?? 'kestrel-native-bridge',
    messages: (context?.messages ?? []) as ToolExecutionOptions<unknown>['messages'],
    ...(context?.abortSignal ? { abortSignal: context.abortSignal } : {}),
    context: undefined,
  });
  if (isAsyncIterable(result)) {
    throw new Error('Read-only tool bridge does not support streaming legacy tool output');
  }
  return await result;
}

/**
 * Description for a native registration, falling back to a deterministic
 * label when a legacy tool has no static description string (the AI SDK also
 * allows function descriptions, which Mastra's string field cannot render).
 */
export function readOnlyToolDescription(
  legacyTool: { description?: unknown },
  name: string,
): string {
  const { description } = legacyTool;
  return typeof description === 'string' && description.length > 0
    ? description
    : `Read-only Kestrel tool: ${name}`;
}

export {
  extractToolPartsFromMessages,
  type MastraToolInvocationPart,
  type MastraToolStreamEvent,
} from './tool-stream-parts';
