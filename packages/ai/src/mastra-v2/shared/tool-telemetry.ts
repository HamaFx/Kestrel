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

import { recordToolTelemetry } from '../../persistence';
import { resolveToolTimeoutMs, ToolTimeoutError } from '../../tools/tool-timeout';
import { requireXauusdUserContext } from '../packets/evidence';
import { MASTRA_XAUUSD_AGENT_ID, MASTRA_XAUUSD_AGENT_VERSION } from './constants';
import { errorCodeForMastra, outputLength } from './stats';

const mlog = createCategorizedLogger('ai', {
  component: 'mastra:xauusd-tool',
  agent: MASTRA_XAUUSD_AGENT_ID,
  agentVersion: MASTRA_XAUUSD_AGENT_VERSION,
});

interface MastraToolContext {
  requestContext?: { get: (key: string) => unknown };
  abortSignal?: AbortSignal;
  observe?: ToolObserve;
  toolCallId?: string;
}

export interface ExecuteMastraToolOptions {
  /** Agent identity for metrics tags. Defaults to the XAUUSD research agent. */
  agentId?: string;
  /** Deadline override (ms). Defaults to the shared per-tool policy. */
  timeoutMs?: number;
}

/**
 * Execute a Mastra tool with one consistent lifecycle boundary. This records
 * metrics and DB telemetry without logging inputs or outputs.
 *
 * F7 parity: every native/adapted read-only tool is bounded by the same
 * per-tool deadline the legacy registry applies (25s default, with per-tool
 * overrides). Without it a hung tool on the Mastra path can consume the whole
 * turn budget. The invocation gets its own abort controller that mirrors the
 * parent turn signal, so the deadline can abort the underlying operation
 * without detaching user cancellation.
 */
export async function executeMastraTool<T>(
  toolName: string,
  context: MastraToolContext,
  fn: (effectiveContext: MastraToolContext) => Promise<T>,
  options: ExecuteMastraToolOptions = {},
): Promise<T> {
  const { userId, runId, threadId } = requireXauusdUserContext(context);
  const agentId = options.agentId ?? MASTRA_XAUUSD_AGENT_ID;
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? resolveToolTimeoutMs(toolName);

  // Give every invocation its own cancellation controller. The parent signal
  // handles turn cancellation; the controller also aborts the underlying
  // operation when the tool deadline expires.
  const toolController = new AbortController();
  const parentSignal = context.abortSignal;
  const onParentAbort = () => toolController.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) onParentAbort();
    else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }
  const effectiveContext: MastraToolContext = { ...context, abortSignal: toolController.signal };
  // Direct call sites read `context.abortSignal` from their closure; mirror the
  // effective signal so they observe parent aborts and the deadline too.
  try {
    context.abortSignal = toolController.signal;
  } catch {
    // A frozen context keeps the original signal; the race below still
    // enforces the deadline for the caller.
  }

  const runWithDeadline = async (): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<T>((resolve, reject) => {
        timer = setTimeout(() => {
          const timeoutError = new ToolTimeoutError(toolName, timeoutMs);
          // Reject first so a synchronously abort-aware tool cannot replace
          // the stable timeout error with its own error.
          reject(timeoutError);
          toolController.abort(timeoutError);
        }, timeoutMs);
        fn(effectiveContext).then(resolve, reject);
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const execute = async () => {
    try {
      const output = await runWithDeadline();
      const durationMs = Math.max(0, Date.now() - startedAt);
      metrics.increment('mastra_tool_call_total', {
        tags: { agent: agentId, tool: toolName, outcome: 'success' },
      });
      metrics.observe('total_latency_ms', durationMs, {
        tags: { agent: agentId, tool: toolName },
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
        tags: { agent: agentId, tool: toolName, error: errorCode },
      });
      metrics.increment('mastra_tool_call_total', {
        tags: { agent: agentId, tool: toolName, outcome: 'failed' },
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

  try {
    if (context.observe) {
      return await context.observe.span(`kestrel.mastra.tool.${toolName}`, execute, {
        agent: MASTRA_XAUUSD_AGENT_ID,
        agentVersion: MASTRA_XAUUSD_AGENT_VERSION,
        tool: toolName,
        runId,
      });
    }
    return await execute();
  } finally {
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}
