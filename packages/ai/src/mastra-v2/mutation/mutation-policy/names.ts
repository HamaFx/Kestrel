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

// Mutation + system-action names (DEC-05 split of mutation-policy.ts). This is
// the closed vocabulary every other mutation module validates against.

import { pluginHost } from '@kestrel/plugin-sdk';
import { z } from 'zod';

/**
 * Writes implemented by the core workflow. Kept as a strict enum because
 * these names are routed through the durable confirmation ledger.
 */
export const CORE_MUTATION_NAMES = [
  'set_alert',
  'log_journal',
  'share_snapshot',
  'run_system_action',
] as const;

export const MastraMutationNameSchema = z.enum(CORE_MUTATION_NAMES);

export type CoreMutationName = z.infer<typeof MastraMutationNameSchema>;

/**
 * A mutation id is either a core write or a plugin write tool registered on
 * `pluginHost`. Widening the type does not bypass the closed core enum or the
 * plugin registry checks below — an arbitrary string still fails closed.
 */
export type MastraMutationName = CoreMutationName | (string & {});

export function isCoreMutationName(name: string): name is CoreMutationName {
  return (CORE_MUTATION_NAMES as readonly string[]).includes(name);
}

export interface PluginWriteTool {
  pluginId: string;
  access: 'read-only' | 'sensitive-read' | 'write';
}

/** Resolve a plugin write tool, if the id belongs to one. */
export function pluginWriteTool(name: string): PluginWriteTool | undefined {
  const tool = pluginHost.getTool(name);
  if (!tool || tool.access !== 'write') return undefined;
  return { pluginId: tool.pluginId, access: tool.access };
}

/**
 * Closed registry for operator actions. Mutation extraction and confirmation
 * must validate against this registry before any executor is reached; an
 * LLM-provided action string is never an authorization decision.
 */
export const SYSTEM_ACTION_REGISTRY = {
  resonance_sync: {
    requiresAdmin: true,
    timeoutMs: 120_000,
    auditLabel: 'system.resonance_sync',
  },
} as const;

export type SystemActionId = keyof typeof SYSTEM_ACTION_REGISTRY;

export function isRegisteredSystemAction(action: string): action is SystemActionId {
  return Object.prototype.hasOwnProperty.call(SYSTEM_ACTION_REGISTRY, action);
}
