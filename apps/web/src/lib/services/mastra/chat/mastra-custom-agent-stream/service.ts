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

// Streaming runner for a user-authored standalone agent (`@handle`).
//
// It delegates the turn lifecycle (budget, persistence, tool events, title,
// settlement) to `runMastraSseTurn` and keeps only the pieces that make a
// custom agent different: the plugin runtime stream factory, the custom-agent
// metadata, run records, and the deferred diagnostic trace. It deliberately
// skips the market-evidence gate: a custom agent is a general-purpose persona,
// not Kestrel's verified market-report path.

import 'server-only';

import {
  extractUserMessageText,
  getDiagnosticContext,
  persistDiagnosticContext,
  withDiagnostics,
} from '@kestrel/ai';
import { listMessages } from '@kestrel/ai/persistence';
import {
  recordCustomAgentRun,
  runCustomAgentStream,
  type CustomAgentDescriptor,
  type CustomAgentStreamResult,
  type InstalledPluginRuntime,
} from '@kestrel/ai/plugins';
import type { UIMessage } from 'ai';

import { runMastraSseTurn } from '@/lib/services/mastra/stream/run-mastra-sse-turn';

import {
  buildCustomAgentMetaData,
  buildCustomAssistantMessage,
  buildMemoryDegradedPart,
} from './telemetry';
import {
  toolEventToStreamEvent,
  type CustomAgentCompletion,
  type LiveToolEvent,
} from './tool-events';

export interface RunCustomAgentStreamInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  /** Prompt with the leading `@handle` removed. */
  prompt: string;
  descriptor: CustomAgentDescriptor;
  runtime: InstalledPluginRuntime;
  customInstructions?: string;
  responseStyle?: 'default' | 'concise' | 'technical' | 'risk-first';
  citeSources?: boolean;
  modelOverride?: string | null;
  signal?: AbortSignal;
}

export async function runCustomAgentStreamService(
  input: RunCustomAgentStreamInput,
): Promise<Response> {
  const runId = crypto.randomUUID();
  // Phase 1 (observability roadmap) — the `@handle` stream owns its diagnostic
  // scope for the whole stream lifetime. `deferCompletion` keeps the trace
  // from persisting when the HTTP response handle returns; the stream's
  // terminal paths persist it once the stream completes or errors.
  return withDiagnostics(
    input.userId,
    input.threadId,
    () => executeCustomAgentStreamService(input, runId),
    { deferCompletion: true, traceId: runId, runId },
  );
}

async function executeCustomAgentStreamService(
  input: RunCustomAgentStreamInput,
  runId: string,
): Promise<Response> {
  const diagCtx = getDiagnosticContext();
  const startedAt = Date.now();

  // Exactly one terminal diagnostic write per stream, mirroring the run
  // finalizer's one-terminal-record guarantee.
  let diagnosticsPersisted = false;
  const persistTerminalDiagnostics = async (status: 'completed' | 'failed'): Promise<void> => {
    if (diagnosticsPersisted) return;
    diagnosticsPersisted = true;
    await persistDiagnosticContext(diagCtx, status);
  };

  return runMastraSseTurn<CustomAgentCompletion, CustomAgentStreamResult>({
    userId: input.userId,
    threadId: input.threadId,
    userMessage: input.userMessage,
    idempotencyPrefix: 'mastra-custom-agent',
    runId,
    ...(input.signal ? { signal: input.signal } : {}),
    openStream: async ({ ledger, settings, env, emitToolEvent }) => {
      const historyRows = await listMessages(input.userId, input.threadId, 60);
      const currentUserKey = `ui:${input.userMessage.id}`;
      const history: UIMessage[] = historyRows
        .filter((row) => row.idempotencyKey !== currentUserKey)
        .map((row) => ({
          id: row.id,
          role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
          parts:
            Array.isArray(row.parts) && row.parts.length > 0
              ? (row.parts as UIMessage['parts'])
              : [{ type: 'text', text: row.content }],
        }));

      return runCustomAgentStream({
        runtime: input.runtime,
        descriptor: input.descriptor,
        settings,
        env,
        userId: input.userId,
        threadId: input.threadId,
        userMessage: input.userMessage,
        history,
        prompt: input.prompt,
        ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        excludeMessageIdempotencyKey: currentUserKey,
        ledger,
        runId,
        ...(input.customInstructions ||
        input.responseStyle !== undefined ||
        input.citeSources !== undefined
          ? {
              preferences: {
                ...(input.customInstructions
                  ? { customInstructions: input.customInstructions }
                  : {}),
                ...(input.responseStyle ? { responseStyle: input.responseStyle } : {}),
                ...(input.citeSources !== undefined ? { citeSources: input.citeSources } : {}),
              },
            }
          : {}),
        onToolEvent: (event) => {
          const mapped = toolEventToStreamEvent(event as unknown as LiveToolEvent);
          if (mapped) {
            emitToolEvent(mapped, { markEmitted: mapped.type === 'tool-output-available' });
          }
        },
      });
    },
    title: ({ completed }) => ({
      firstUser: extractUserMessageText(input.userMessage),
      firstAssistant: completed.text,
    }),
    finalize: async ({ runId: turnRunId, messageId, postTextEvents, completed, observedCost }) => {
      const memoryDegradedPart = buildMemoryDegradedPart(completed.memoryMode);
      if (memoryDegradedPart) {
        postTextEvents.push({
          type: 'data-memory-degraded',
          id: messageId,
          reason: memoryDegradedPart.reason,
          createdAt: memoryDegradedPart.createdAt,
        });
      }

      const metaData = buildCustomAgentMetaData(
        input.descriptor,
        turnRunId,
        completed,
        observedCost,
      );
      postTextEvents.push({ type: 'data-multi-agent-meta', id: messageId, data: metaData });

      return buildCustomAssistantMessage(
        messageId,
        completed.toolParts,
        completed.text,
        memoryDegradedPart,
        metaData,
        completed.fallbackParts ?? [],
      );
    },
    afterSettle: async ({ completed, observedCost }) => {
      await recordCustomAgentRun({
        runtime: input.runtime,
        descriptor: input.descriptor,
        runId,
        threadId: input.threadId,
        status: 'succeeded',
        model: completed.modelId,
        latencyMs: Date.now() - startedAt,
        costUsd: observedCost,
        toolCalls: completed.stats.toolCalls,
        inputChars: input.prompt.length,
        outputChars: completed.text.length,
      });
      await persistTerminalDiagnostics('completed');
    },
    onFailure: async ({ error, ledger, aborted }) => {
      await persistTerminalDiagnostics('failed');
      await recordCustomAgentRun({
        runtime: input.runtime,
        descriptor: input.descriptor,
        runId,
        threadId: input.threadId,
        status: aborted ? 'cancelled' : 'failed',
        model: input.descriptor.agent.model ?? null,
        latencyMs: Date.now() - startedAt,
        costUsd: ledger.total(),
        toolCalls: 0,
        inputChars: input.prompt.length,
        outputChars: 0,
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    },
    onAbort: async () => {
      await persistTerminalDiagnostics('failed');
    },
  });
}
