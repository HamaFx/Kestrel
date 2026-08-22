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

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger, logErrorContext } from '@kestrel/shared/logger';
import type { ToolObserve } from '@mastra/core/tools';

import { recordToolTelemetry } from '../persistence';
import { MASTRA_XAUUSD_AGENT_ID, MASTRA_XAUUSD_AGENT_VERSION } from './constants';
import { requireXauusdUserContext } from './evidence';
import { errorCodeForMastra, outputLength } from './stats';

const mlog = createCategorizedLogger('ai', {
  component: 'mastra-xauusd-tool',
  agent: MASTRA_XAUUSD_AGENT_ID,
  agentVersion: MASTRA_XAUUSD_AGENT_VERSION,
});

interface MastraToolContext {
  requestContext?: { get: (key: string) => unknown };
  abortSignal?: AbortSignal;
  observe?: ToolObserve;
  toolCallId?: string;
}

/**
 * Execute a Mastra tool with one consistent lifecycle boundary. This records
 * metrics and DB telemetry without logging inputs or outputs.
 */
export async function executeMastraTool<T>(
  toolName: string,
  context: MastraToolContext,
  fn: () => Promise<T>,
): Promise<T> {
  const { userId, runId, threadId } = requireXauusdUserContext(context);
  const startedAt = Date.now();
  const execute = async () => {
    try {
      const output = await fn();
      const durationMs = Math.max(0, Date.now() - startedAt);
      metrics.increment('mastra_tool_call_total', {
        tags: { agent: MASTRA_XAUUSD_AGENT_ID, tool: toolName, outcome: 'success' },
      });
      metrics.observe('total_latency_ms', durationMs, {
        tags: { agent: MASTRA_XAUUSD_AGENT_ID, tool: toolName },
      });
      void recordToolTelemetry({
        userId,
        threadId: threadId ?? null,
        messageId: null,
        runId,
        tool: toolName,
        ms: durationMs,
        ok: true,
        outputChars: outputLength(output),
        ...(context.toolCallId
          ? { idempotencyKey: `mastra.tool:${runId}:${context.toolCallId}:success` }
          : {}),
      }).catch((error: unknown) => {
        mlog.warn('Mastra tool telemetry persistence failed', {
          runId,
          tool: toolName,
          err: error instanceof Error ? error.name : 'UnknownError',
        });
      });
      return output;
    } catch (error) {
      const durationMs = Math.max(0, Date.now() - startedAt);
      const errorCode = errorCodeForMastra(error);
      metrics.increment('mastra_tool_failed_total', {
        tags: { agent: MASTRA_XAUUSD_AGENT_ID, tool: toolName, error: errorCode },
      });
      metrics.increment('mastra_tool_call_total', {
        tags: { agent: MASTRA_XAUUSD_AGENT_ID, tool: toolName, outcome: 'failed' },
      });
      void recordToolTelemetry({
        userId,
        threadId: threadId ?? null,
        messageId: null,
        runId,
        tool: toolName,
        ms: durationMs,
        ok: false,
        errorCode,
        ...(context.toolCallId
          ? { idempotencyKey: `mastra.tool:${runId}:${context.toolCallId}:failed` }
          : {}),
      }).catch((telemetryError: unknown) => {
        mlog.warn('Mastra failed-tool telemetry persistence failed', {
          runId,
          tool: toolName,
          err: telemetryError instanceof Error ? telemetryError.name : 'UnknownError',
        });
      });
      logErrorContext(error, `mastra_tool.${toolName}`, { runId, tool: toolName }, 'ai');
      throw error;
    }
  };

  if (context.observe) {
    return context.observe.span(`kestrel.mastra.tool.${toolName}`, execute, {
      agent: MASTRA_XAUUSD_AGENT_ID,
      agentVersion: MASTRA_XAUUSD_AGENT_VERSION,
      tool: toolName,
      runId,
    });
  }
  return execute();
}
