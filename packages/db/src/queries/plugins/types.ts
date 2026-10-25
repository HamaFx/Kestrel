/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Row shapes and inputs for per-user plugin install state and plugin storage.

import type { schema } from '../../client';

export type InstalledPluginRow = typeof schema.userInstalledPlugins.$inferSelect;

export interface InstallPluginInput {
  userId: string;
  pluginId: string;
  /** Already encrypted by `encryptPluginSettings` when the plugin has secrets. */
  settings?: Record<string, unknown>;
  onboardingCompleted?: boolean;
}

export interface PluginStorageScope {
  userId: string;
  pluginId: string;
  /** Optional cached tenant id; resolved from membership when omitted. */
  tenantId?: string;
}

export interface PluginStorageValue {
  key: string;
  value: unknown;
  updatedAt: Date;
}

export interface UpdatePluginSettingsInput {
  userId: string;
  pluginId: string;
  settings: Record<string, unknown>;
  onboardingCompleted?: boolean;
}
