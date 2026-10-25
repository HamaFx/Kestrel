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

// Context assembly for a mode run: the Mastra RequestContext (user/run/thread
// scope + installed plugins) and the tool context handed to every workflow step.

import type { UserSettingsRow } from '@kestrel/db/schema';
import { RequestContext } from '@mastra/core/request-context';

import { REQUEST_CONTEXT_SCHEMA } from '@ai/committee/types';
import type { GenerationLedger } from '@ai/persistence/generation-ledger';
import { getInstalledPluginRuntime } from '@ai/plugins';
import { getDb } from '@ai/runtime/db';
import { createToolContext, type ToolEnv } from '@ai/runtime/tool-context';

import type { RunMastraModeArgs } from './types';

/** Base run context (no packet — the workflow collects it inside its first step). */
export async function contextForRun(args: RunMastraModeArgs): Promise<RequestContext> {
  const pluginRuntime = await getInstalledPluginRuntime(args.userId);
  REQUEST_CONTEXT_SCHEMA.parse({
    userId: args.userId,
    runId: args.runId,
    threadId: args.threadId,
    symbol: args.symbol,
    installedPlugins: [...pluginRuntime.installedPluginIds],
  });
  return new RequestContext([
    ['userId', args.userId],
    ['runId', args.runId],
    ['threadId', args.threadId],
    ['symbol', args.symbol],
    ['installedPlugins', pluginRuntime.installedPluginIds],
  ]);
}

/** Tool context shared by every committee step of one mode run. */
export function buildToolContext(
  args: RunMastraModeArgs,
  ledger: GenerationLedger,
): ReturnType<typeof createToolContext> {
  let toolDb: ReturnType<typeof getDb> | undefined;
  try {
    toolDb = getDb();
  } catch {
    // In unit test environments without DB env config, db is optional
  }
  return createToolContext({
    threadId: args.threadId,
    userId: args.userId,
    latestUserMessageText: args.prompt,
    env: args.env as Partial<ToolEnv>,
    signal: args.signal ?? null,
    budget: {
      spent: 0,
      max:
        (args.settings as UserSettingsRow).maxDailyUsd ??
        (args.env as { MAX_DAILY_USD?: number }).MAX_DAILY_USD ??
        10,
    },
    userSettings: args.settings as UserSettingsRow,
    db: toolDb,
    toolTelemetryBuffer: [],
    ledger,
  });
}
