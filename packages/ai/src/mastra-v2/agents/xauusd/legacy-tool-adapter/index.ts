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

// Legacy read-only tool adapter barrel (DEC-05 split of
// legacy-tool-adapter.ts): the Mastra adapters plus the stream-part parsing
// the canonical chat runner and specialist runner share.
//
//   - stream-parts.ts — UI tool-name mapping + `tool-<name>` part extraction
//
// The adapter bodies stay in this module (the former module's surface) on
// purpose: `createReadOnlyToolExecute` is called at module scope by
// `mastra-v2/tools/canonical/*` and `mastra-v2/agents/xauusd/tools/*`, which
// sit inside the `shared/tool-telemetry` import cycle. Keeping the function
// declarations in the entry module preserves the original hoisting semantics;
// re-exporting them through a second hop would surface an undefined binding to
// those modules during cyclic evaluation.

import type { CandlesResult } from '@kestrel/data';
import { createTool, type ToolObserve } from '@mastra/core/tools';
import type { Tool } from 'ai';

import { MastraMutationNameSchema } from '@ai/mastra-v2/mutation/mutation-policy';
import { qualityFromWarnings } from '@ai/mastra-v2/packets/evidence';
import { executeMastraTool } from '@ai/mastra-v2/shared/tool-telemetry';

import {
  normalizeUiToolName,
  type MastraToolInvocationPart,
  type MastraToolStreamEvent,
} from './stream-parts';

interface LegacyToolWithExecute {
  description?: string;
  inputSchema?: unknown;
  execute?: (
    input: unknown,
    options?: {
      toolCallId?: string;
      messages?: unknown[];
      abortSignal?: AbortSignal;
    },
  ) => Promise<unknown> | unknown;
}

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
 * canonical tool — legacy adapter and Mastra-native registrations alike.
 * Emits live tool UI events, captures tool parts for the streamed response,
 * and records metrics/DB telemetry without logging inputs or outputs.
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
      ((event: MastraToolStreamEvent) => void) | undefined;
    const toolParts = context.requestContext?.get('toolParts') as
      MastraToolInvocationPart[] | undefined;

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
        () => run(input, context),
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

export interface CandleEvidenceMetadata {
  source: string;
  fetchedAt: string;
  dataAsOf: string;
  freshness: 'fresh' | 'stale' | 'unknown';
  quality: 'complete' | 'partial' | 'degraded';
  warnings: string[];
}

/**
 * Convert the data-layer candle metadata into the evidence fields shared by
 * the migrated Mastra adapters. The adapter never infers freshness from the
 * wall clock; it trusts the cache's explicit stale flag.
 */
export function candleEvidenceMetadata(
  result: CandlesResult,
  requestedCount: number,
): CandleEvidenceMetadata {
  const latestCandle = result.candles.at(-1);
  const warnings = [
    ...(result.stale ? ['Candles were served from stale-while-error cache'] : []),
    ...(result.candles.length < requestedCount
      ? [`Only ${result.candles.length} candles were available; ${requestedCount} were requested`]
      : []),
    ...(!latestCandle ? ['No candles were returned'] : []),
  ];

  return {
    source: latestCandle?.source ?? 'unknown',
    fetchedAt: new Date(result.producedAt).toISOString(),
    dataAsOf: new Date(latestCandle?.t ?? result.producedAt).toISOString(),
    freshness: latestCandle ? (result.stale ? 'stale' : 'fresh') : 'unknown',
    quality: qualityFromWarnings(warnings),
    warnings,
  };
}

/**
 * Invoke an existing Kestrel read-only tool without duplicating its
 * deterministic implementation. This bridge remains available for the next
 * adapter migrations; the first market adapters now share pure calculations
 * directly so they can preserve candle metadata without a second fetch.
 */
export async function executeLegacyReadOnlyTool<TOutput>(
  legacyTool: Tool,
  input: unknown,
  signal?: AbortSignal,
): Promise<TOutput> {
  const executable = legacyTool as unknown as LegacyToolWithExecute;
  if (typeof executable.execute !== 'function') {
    throw new Error('Mastra adapter received a legacy tool without an execute function');
  }

  return executable.execute(input, signal ? { abortSignal: signal } : {}) as Promise<TOutput>;
}

/**
 * Adapt a legacy AI SDK read-only tool to a genuine Mastra tool. This is the
 * compatibility seam for the canonical chat runner: Kestrel keeps ownership
 * of the existing tool implementations, while Mastra owns the agent/tool
 * loop. The adapter forwards the authenticated AsyncLocalStorage context and
 * cancellation signal; it never exposes mutation tools.
 *
 * B-01 (audit 2026-10-18): `get_price`, `get_candles`, `get_indicators`, and
 * `search_knowledge` no longer flow through this adapter in the canonical
 * chat — they are registered from `mastra-v2/tools/canonical/*` as native
 * tools that share the same `createReadOnlyToolExecute` lifecycle wrapper.
 */
export function adaptLegacyReadOnlyTool(name: string, legacyTool: Tool) {
  if (MastraMutationNameSchema.safeParse(name).success) {
    throw new Error(
      `Cannot adapt ${name}: mutation tools are forbidden in Mastra read-only agents`,
    );
  }
  const source = legacyTool as unknown as LegacyToolWithExecute;
  if (typeof source.execute !== 'function') {
    throw new Error(`Cannot adapt ${name}: legacy tool has no execute function`);
  }
  const uiToolName = normalizeUiToolName(name);

  return createTool({
    id: `kestrel-${name}`,
    description: source.description ?? `Read-only Kestrel tool: ${name}`,
    ...(source.inputSchema ? { inputSchema: source.inputSchema as never } : {}),
    execute: createReadOnlyToolExecute(`kestrel-${name}`, uiToolName, async (input, context) =>
      source.execute!(input, {
        ...(context.toolCallId ? { toolCallId: context.toolCallId } : {}),
        ...(context.messages ? { messages: context.messages } : {}),
        ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
      }),
    ),
  } as never);
}

/**
 * Adapt a complete specialist tool map while preserving the original tool
 * names used by the specialist prompts. This is intentionally a separate
 * helper from the canonical registry filter: callers must decide the allowed
 * tool set before invoking it, and a missing executor fails closed.
 */
export function adaptLegacyReadOnlyTools(tools: Record<string, Tool>) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, adaptLegacyReadOnlyTool(name, tool)]),
  );
}

export {
  normalizeUiToolName,
  extractToolPartsFromMessages,
  type MastraToolInvocationPart,
  type MastraToolStreamEvent,
} from './stream-parts';
