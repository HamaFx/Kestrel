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

// One resolver for the users a plugin may act for: enabled installs filtered
// to this worker's tenant partition, with decrypted settings and storage.

import { createPluginExecutionContext } from '@kestrel/ai/plugins';
import { listEnabledPluginUsers } from '@kestrel/db';
import { pluginHost, type PluginInstalledUser } from '@kestrel/plugin-sdk';
import { decryptPluginSettings } from '@kestrel/plugin-sdk/settings';
import {
  createTenantRouterFromEnv,
  filterMyTenants,
  type TenantRouter,
} from '@kestrel/shared/tenant-partition';

import type { Logger } from '../log.js';

const tenantRouter = createTenantRouterFromEnv();

export async function loadInstalledPluginUsers(
  pluginId: string,
  log: Logger,
  router: TenantRouter = tenantRouter,
  listUsers: typeof listEnabledPluginUsers = listEnabledPluginUsers,
): Promise<readonly PluginInstalledUser[]> {
  try {
    const allRows = await listUsers(pluginId);
    // R16 — only this worker partition's tenants, like core jobs.
    const rows = filterMyTenants(allRows, router);
    const manifest = pluginHost.getPlugin(pluginId)?.manifest;
    return rows.map((row) => {
      const settings = decryptPluginSettings(manifest?.settingsSchema, row.settings ?? {});
      const ctx = createPluginExecutionContext({
        userId: row.userId,
        tenantId: row.tenantId,
        pluginId,
        settings,
      });
      return {
        userId: row.userId,
        tenantId: row.tenantId,
        settings,
        storage: ctx.storage,
      };
    });
  } catch (err) {
    log.error('Failed to resolve plugin installed users', {
      pluginId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
