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

import 'server-only';

// Stateless plugin-tool confirmation execution (P0-6).
//
// The chat adapter returns a confirmation envelope instead of running a
// `requiresConfirmation` tool. This service backs the chat card's Confirm
// action: it re-resolves the install, re-validates the proposed input against
// the tool's real schema, and executes the tool with the same execution
// context (decrypted settings + tenant-scoped storage) the chat adapter uses.

import {
  getInstalledPluginRuntime,
  pluginExecutionContextFor,
  runWithPluginTenantScope,
} from '@kestrel/ai/plugins';
import { getInstalledPlugin } from '@kestrel/db';
import { pluginHost } from '@kestrel/plugin-sdk';
import { ensureBundledPluginsRegistered } from '@kestrel/plugins';
import { AppError } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

try {
  ensureBundledPluginsRegistered();
} catch (err) {
  console.error('[plugin-tool-confirm] bundled plugin registration failed', err);
}

const log = createCategorizedLogger('api', { component: 'plugin-tool-confirm' });

export interface ConfirmPluginToolExecutionInput {
  userId: string;
  pluginId: string;
  toolId: string;
  input: unknown;
  signal?: AbortSignal | null;
}

/**
 * Execute one confirmed plugin tool call.
 *
 * Throws `AppError` with the right status for unknown tools/plugins (404) and
 * schema drift (400); execution failures surface as a 500 envelope.
 */
export async function confirmPluginToolExecution(
  input: ConfirmPluginToolExecutionInput,
): Promise<unknown> {
  const tool = pluginHost.getTool(input.toolId);
  if (!tool || tool.pluginId !== input.pluginId) {
    throw new AppError('NOT_FOUND', `Plugin tool "${input.toolId}" was not found.`, 404);
  }

  const install = await getInstalledPlugin(input.userId, input.pluginId);
  if (!install || !install.enabled) {
    throw new AppError('NOT_FOUND', `Plugin "${input.pluginId}" is not installed.`, 404);
  }

  const parsed = tool.inputSchema.safeParse(input.input);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION',
      'The confirmed input no longer matches this tool schema. Ask again in chat.',
      400,
      parsed.error.flatten(),
    );
  }

  const runtime = await getInstalledPluginRuntime(input.userId);
  if (!runtime.installedPluginIds.includes(input.pluginId) || !runtime.tenantId) {
    throw new AppError('NOT_FOUND', `Plugin "${input.pluginId}" is not installed.`, 404);
  }

  const ctx = pluginExecutionContextFor(runtime, tool, {
    ...(input.signal ? { signal: input.signal } : {}),
  });

  try {
    return await runWithPluginTenantScope(runtime.userId, runtime.tenantId, () =>
      tool.execute(parsed.data, ctx),
    );
  } catch (err) {
    log.error('confirmed plugin tool execution failed', {
      pluginId: input.pluginId,
      toolId: input.toolId,
      userId: input.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(
      'INTERNAL',
      err instanceof Error ? err.message : 'The plugin tool failed to execute.',
      500,
    );
  }
}
