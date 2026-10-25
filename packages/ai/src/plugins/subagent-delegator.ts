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

// Delegatable custom-agent subagents + catalog run-ledger hook.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { Agent } from '@mastra/core/agent';

import { buildCustomAgent, type CustomAgentEnv } from './agent-builder';
import {
  buildCatalogContext,
  listUserCustomAgents,
  MAX_SUBAGENTS,
  type CustomAgentDescriptor,
} from './agent-catalog';
import { alog } from './agent-log';
import type { InstalledPluginRuntime } from './runtime';

export async function buildCustomAgentSubagents(args: {
  runtime: InstalledPluginRuntime;
  settings: UserSettingsRow;
  env: CustomAgentEnv;
  userId: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<Record<string, Agent>> {
  const descriptors = await listUserCustomAgents(args.runtime);
  const delegatable = descriptors
    .filter((entry) => entry.agent.delegatable)
    .slice(0, MAX_SUBAGENTS);
  if (delegatable.length === 0) return {};

  const result: Record<string, Agent> = {};
  for (const descriptor of delegatable) {
    try {
      const built = await buildCustomAgent({
        runtime: args.runtime,
        descriptor,
        settings: args.settings,
        env: args.env,
        userId: args.userId,
        threadId: args.threadId,
        ...(args.signal ? { signal: args.signal } : {}),
        readOnlyOnly: true,
        includeMcp: false,
        withMemory: false,
      });
      result[descriptor.agent.slug] = built.agent;
    } catch (err) {
      alog.warn('delegatable custom agent could not be built; skipping', {
        agent: descriptor.agent.slug,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

/** Best-effort run ledger hook owned by the catalog. */
export async function recordCustomAgentRun(args: {
  runtime: InstalledPluginRuntime;
  descriptor: CustomAgentDescriptor;
  runId: string;
  threadId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  model: string | null;
  latencyMs: number;
  costUsd: number;
  toolCalls: number;
  inputChars: number;
  outputChars: number;
  error?: string | null;
}): Promise<void> {
  if (!args.descriptor.catalog.recordRun) return;
  try {
    await args.descriptor.catalog.recordRun({
      ctx: buildCatalogContext(args.runtime, args.descriptor.pluginId),
      agent: args.descriptor.agent,
      runId: args.runId,
      threadId: args.threadId,
      status: args.status,
      model: args.model,
      latencyMs: args.latencyMs,
      costUsd: args.costUsd,
      toolCalls: args.toolCalls,
      inputChars: args.inputChars,
      outputChars: args.outputChars,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });
  } catch (err) {
    alog.warn('custom agent run ledger write failed', {
      agent: args.descriptor.agent.slug,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
