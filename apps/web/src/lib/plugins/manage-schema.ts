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

// Request contract for /api/plugins/manage.
//
// Shared by the route handler and the Plugin Store client so the wire format
// has a single source of truth.

import { z } from 'zod';

import type { PluginStoreEntry } from './types';

const PluginIdSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Plugin id must be kebab-case');

const SettingsSchema = z.record(z.string(), z.unknown());

export const PluginInstallRequestSchema = z.object({
  action: z.literal('install'),
  pluginId: PluginIdSchema,
  /** Partial settings from a setup wizard. Masked secrets are ignored. */
  settings: SettingsSchema.optional(),
  /** Wizard completion. Instant plugins default to true. */
  completeOnboarding: z.boolean().optional(),
});

export const PluginUninstallRequestSchema = z.object({
  action: z.literal('uninstall'),
  pluginId: PluginIdSchema,
  /** Delete every `plugin_storage` document for this user + plugin. */
  wipeData: z.boolean().optional(),
});

export const PluginUpdateSettingsRequestSchema = z.object({
  action: z.literal('update-settings'),
  pluginId: PluginIdSchema,
  settings: SettingsSchema,
  completeOnboarding: z.boolean().optional(),
});

export const PluginSetEnabledRequestSchema = z.object({
  action: z.literal('set-enabled'),
  pluginId: PluginIdSchema,
  enabled: z.boolean(),
});

export const PluginManageRequestSchema = z.discriminatedUnion('action', [
  PluginInstallRequestSchema,
  PluginUninstallRequestSchema,
  PluginUpdateSettingsRequestSchema,
  PluginSetEnabledRequestSchema,
]);

export type PluginInstallRequest = z.infer<typeof PluginInstallRequestSchema>;
export type PluginUninstallRequest = z.infer<typeof PluginUninstallRequestSchema>;
export type PluginUpdateSettingsRequest = z.infer<typeof PluginUpdateSettingsRequestSchema>;
export type PluginSetEnabledRequest = z.infer<typeof PluginSetEnabledRequestSchema>;
export type PluginManageRequest = z.infer<typeof PluginManageRequestSchema>;

export interface PluginManageResponse {
  plugin: PluginStoreEntry | null;
  pluginId: string;
  installed: boolean;
  /** Human-readable note for the Store toast. */
  message: string;
  /** Set when a best-effort lifecycle hook failed but the action succeeded. */
  warning?: string;
}
