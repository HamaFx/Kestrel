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

// Registration-time validation: id shapes, reserved core ids, and the
// per-capability assertions used by `PluginHost.register()`.

import { TOOL_NAMES } from '@kestrel/shared';

import type { PluginAgentTarget, PluginId, PluginToolRegistration } from '../types';

export const PLUGIN_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
export const JOB_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const INDICATOR_KIND_RE = /^[a-z][a-z0-9_]{0,47}$/;

export const AGENT_TARGETS: ReadonlySet<PluginAgentTarget> = new Set([
  'canonical-chat',
  'technical',
  'fundamental',
  'risk',
  'sentiment',
]);

/** Tool ids owned by the core. A plugin may never shadow one. */
export const RESERVED_TOOL_NAMES = new Set<string>(TOOL_NAMES);

/**
 * Notification channels implemented by the core delivery registry. Plugin
 * channels must use a distinct id so ordering/fallback remains predictable.
 */
export const RESERVED_ALERT_CHANNELS = new Set(['email', 'telegram', 'web-push']);

/** Core indicator kinds; plugins add new kinds instead of shadowing these. */
export const RESERVED_INDICATOR_KINDS = new Set([
  'sma',
  'ema',
  'rsi',
  'macd',
  'atr',
  'bollinger',
  'pivots',
]);

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[plugin-sdk] ${message}`);
}

export function assertKebabId(value: string, label: string): void {
  assert(PLUGIN_ID_RE.test(value), `${label} must be kebab-case, got "${value}"`);
}

export function assertUniqueId(seen: Set<string>, id: string, label: string): void {
  assert(!seen.has(id), `duplicate ${label} "${id}"`);
  seen.add(id);
}

export function assertTool(tool: PluginToolRegistration, pluginId: PluginId): void {
  assert(tool && typeof tool === 'object', `plugin "${pluginId}" has an invalid tool`);
  assert(
    TOOL_NAME_RE.test(tool.name),
    `plugin "${pluginId}" tool name "${tool.name}" must be snake_case (max 64 chars)`,
  );
  assert(
    typeof tool.description === 'string' && tool.description.trim().length > 0,
    `plugin "${pluginId}" tool "${tool.name}" requires a description`,
  );
  assert(
    tool.inputSchema !== undefined && tool.outputSchema !== undefined,
    `plugin "${pluginId}" tool "${tool.name}" requires input and output schemas`,
  );
  assert(
    tool.access === 'read-only' || tool.access === 'sensitive-read' || tool.access === 'write',
    `plugin "${pluginId}" tool "${tool.name}" has an invalid access level`,
  );
  assert(
    typeof tool.execute === 'function',
    `plugin "${pluginId}" tool "${tool.name}" requires an execute function`,
  );
  for (const target of tool.attachTo ?? []) {
    assert(
      AGENT_TARGETS.has(target),
      `plugin "${pluginId}" tool "${tool.name}" has an invalid attachTo target "${String(target)}"`,
    );
  }
}
