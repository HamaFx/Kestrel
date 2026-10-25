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

// Per-user Custom Agents settings.

import { z } from 'zod';

export const PLUGIN_ID = 'custom-agents';

export const settingsSchema = z.object({
  maxAgents: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum number of custom agents this user may create'),
  maxDelegatedAgents: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(4)
    .describe('How many delegatable agents the main chat may attach at once'),
  defaultModel: z
    .string()
    .max(160)
    .default('')
    .describe(
      'Optional default model for new agents (provider:model). Blank uses your chat model.',
    ),
  allowWriteTools: z
    .boolean()
    .default(false)
    .describe('Allow agents to attach installed-plugin write tools (always approval-gated)'),
  allowMcp: z.boolean().default(true).describe('Allow agents to connect to remote MCP servers'),
  maxMcpServers: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(2)
    .describe('Maximum MCP servers per agent'),
  seedStarterAgents: z
    .boolean()
    .default(true)
    .describe('Seed the four starter agents on first install (recommended)'),
});

export type CustomAgentSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: CustomAgentSettings = settingsSchema.parse({});

export function normaliseSettings(raw: Readonly<Record<string, unknown>>): CustomAgentSettings {
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const merged = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...raw });
  return merged.success ? merged.data : DEFAULT_SETTINGS;
}
