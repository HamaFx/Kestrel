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

// Plugin Store lifecycle actions: install, uninstall, settings, enable.
// One place owns the install ledger, lifecycle hooks, settings encryption and
// cache invalidation.

import { createPluginExecutionContext, invalidateInstalledPluginCache } from '@kestrel/ai/plugins';
import {
  getInstalledPlugin,
  installPlugin,
  pluginStorageGet,
  pluginStorageSet,
  setPluginEnabled,
  uninstallPlugin,
  updatePluginSettings,
  type InstalledPluginRow,
} from '@kestrel/db';
import { pluginHost, type RegisteredPlugin } from '@kestrel/plugin-sdk';
import { decryptPluginSettings, preparePluginSettings } from '@kestrel/plugin-sdk/settings';
import { notFound, providerUnavailable } from '@kestrel/shared/errors';

import type {
  PluginInstallRequest,
  PluginManageResponse,
  PluginSetEnabledRequest,
  PluginUninstallRequest,
  PluginUpdateSettingsRequest,
} from '../../plugins/manage-schema';
import { plog } from './runtime';
import { buildPluginStoreEntry, decryptedRowSettings } from './store-metadata';

/** Snapshot kept in plugin_storage when a user uninstalls without wiping. */
const INSTALL_STATE_COLLECTION = 'install-state';
const INSTALL_STATE_KEY = 'settings';

function registeredOrThrow(pluginId: string): RegisteredPlugin {
  const registered = pluginHost.getPlugin(pluginId);
  if (!registered) throw notFound(`Unknown plugin "${pluginId}"`);
  return registered;
}

function lifecycleContext(
  registered: RegisteredPlugin,
  row: InstalledPluginRow,
  plainSettings: Record<string, unknown>,
  onboardingCompleted: boolean,
) {
  const ctx = createPluginExecutionContext({
    userId: row.userId,
    tenantId: row.tenantId,
    pluginId: registered.manifest.id,
    settings: plainSettings,
  });
  return { ...ctx, onboardingCompleted };
}

export async function installPluginForUser(
  userId: string,
  request: PluginInstallRequest,
): Promise<PluginManageResponse> {
  const registered = registeredOrThrow(request.pluginId);
  const manifest = registered.manifest;
  const existing = await getInstalledPlugin(userId, request.pluginId);

  const restoredSnapshot = existing
    ? null
    : await pluginStorageGet(
        { userId, pluginId: request.pluginId },
        INSTALL_STATE_COLLECTION,
        INSTALL_STATE_KEY,
      ).catch(() => null);

  const restoredSettings =
    restoredSnapshot !== null &&
    typeof restoredSnapshot === 'object' &&
    typeof (restoredSnapshot as { settings?: unknown }).settings === 'object'
      ? ((restoredSnapshot as { settings: Record<string, unknown> }).settings ?? null)
      : null;

  const existingPlain = existing
    ? decryptedRowSettings(manifest, existing)
    : restoredSettings
      ? decryptPluginSettings(manifest.settingsSchema, restoredSettings)
      : { ...(manifest.defaultSettings ?? {}) };

  const prepared = preparePluginSettings({
    schema: manifest.settingsSchema,
    existing: existingPlain,
    input: request.settings ?? {},
  });

  const restoredOnboardingCompleted =
    restoredSnapshot !== null &&
    typeof restoredSnapshot === 'object' &&
    (restoredSnapshot as { onboardingCompleted?: unknown }).onboardingCompleted === true;

  const onboardingCompleted =
    request.completeOnboarding ??
    existing?.onboardingCompleted ??
    (restoredSnapshot ? restoredOnboardingCompleted : manifest.installMode === 'instant');

  const row = await installPlugin({
    userId,
    pluginId: request.pluginId,
    settings: prepared.stored,
    onboardingCompleted,
  });
  invalidateInstalledPluginCache(userId);

  let warning: string | undefined;
  if (registered.plugin.onUserInstall) {
    try {
      await registered.plugin.onUserInstall(
        lifecycleContext(registered, row, prepared.plain, onboardingCompleted),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      plog.error('plugin onUserInstall failed', {
        pluginId: request.pluginId,
        userId,
        err: reason,
      });
      if (!existing) {
        // A fresh install whose seed step failed must not look installed.
        await uninstallPlugin({ userId, pluginId: request.pluginId, wipeData: false }).catch(
          (cleanupErr: unknown) => {
            plog.error('plugin install compensation failed', {
              pluginId: request.pluginId,
              userId,
              err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            });
          },
        );
        invalidateInstalledPluginCache(userId);
        throw providerUnavailable(`${manifest.name} could not finish setup`, { reason });
      }
      warning = `Installed, but the plugin's setup hook failed: ${reason}`;
    }
  }

  const freshRow = (await getInstalledPlugin(userId, request.pluginId)) ?? row;
  invalidateInstalledPluginCache(userId);

  return {
    plugin: buildPluginStoreEntry(registered, freshRow),
    pluginId: request.pluginId,
    installed: true,
    message: `${manifest.name} installed`,
    ...(warning ? { warning } : {}),
  };
}

export async function uninstallPluginForUser(
  userId: string,
  request: PluginUninstallRequest,
): Promise<PluginManageResponse> {
  const registered = registeredOrThrow(request.pluginId);
  const existing = await getInstalledPlugin(userId, request.pluginId);

  if (!existing) {
    return {
      plugin: buildPluginStoreEntry(registered, undefined),
      pluginId: request.pluginId,
      installed: false,
      message: `${registered.manifest.name} was not installed`,
    };
  }

  let warning: string | undefined;

  if (registered.plugin.onUserUninstall) {
    const plain = decryptedRowSettings(registered.manifest, existing);
    try {
      await registered.plugin.onUserUninstall({
        ...lifecycleContext(registered, existing, plain, existing.onboardingCompleted),
        ...(request.wipeData !== undefined ? { wipeData: request.wipeData } : {}),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      plog.warn('plugin onUserUninstall failed; continuing with removal', {
        pluginId: request.pluginId,
        userId,
        err: reason,
      });
      warning = `Removed, but the plugin's cleanup hook failed: ${reason}`;
    }
  }

  // Preserve encrypted settings/data when the user chooses "keep plugin
  // data". A later reinstall restores the settings snapshot. Snapshot after
  // the cleanup hook so fields the plugin cleared (webhook URL, linked chat)
  // are not restored as stale on reinstall.
  if (!request.wipeData) {
    const refreshed = (await getInstalledPlugin(userId, request.pluginId)) ?? existing;
    try {
      await pluginStorageSet(
        { userId, pluginId: request.pluginId, tenantId: refreshed.tenantId },
        INSTALL_STATE_COLLECTION,
        INSTALL_STATE_KEY,
        {
          settings: refreshed.settings,
          onboardingCompleted: refreshed.onboardingCompleted,
          savedAt: new Date().toISOString(),
        },
      );
    } catch (err) {
      plog.warn('could not snapshot plugin settings before uninstall', {
        pluginId: request.pluginId,
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await uninstallPlugin({
    userId,
    pluginId: request.pluginId,
    ...(request.wipeData !== undefined ? { wipeData: request.wipeData } : {}),
  });
  invalidateInstalledPluginCache(userId);

  return {
    plugin: buildPluginStoreEntry(registered, undefined),
    pluginId: request.pluginId,
    installed: false,
    message: `${registered.manifest.name} uninstalled`,
    ...(warning ? { warning } : {}),
  };
}

export async function updatePluginSettingsForUser(
  userId: string,
  request: PluginUpdateSettingsRequest,
): Promise<PluginManageResponse> {
  const registered = registeredOrThrow(request.pluginId);
  const manifest = registered.manifest;
  const existing = await getInstalledPlugin(userId, request.pluginId);
  if (!existing) {
    throw notFound(`Plugin "${request.pluginId}" is not installed`);
  }

  const prepared = preparePluginSettings({
    schema: manifest.settingsSchema,
    existing: decryptedRowSettings(manifest, existing),
    input: request.settings,
  });

  const row = await updatePluginSettings({
    userId,
    pluginId: request.pluginId,
    settings: prepared.stored,
    onboardingCompleted: request.completeOnboarding ?? existing.onboardingCompleted,
  });
  invalidateInstalledPluginCache(userId);

  if (!row) throw notFound(`Plugin "${request.pluginId}" is not installed`);

  return {
    plugin: buildPluginStoreEntry(registered, row),
    pluginId: request.pluginId,
    installed: true,
    message: request.completeOnboarding ? `${manifest.name} setup complete` : 'Settings saved',
  };
}

export async function setPluginEnabledForUser(
  userId: string,
  request: PluginSetEnabledRequest,
): Promise<PluginManageResponse> {
  const registered = registeredOrThrow(request.pluginId);
  const row = await setPluginEnabled(userId, request.pluginId, request.enabled);
  if (!row) throw notFound(`Plugin "${request.pluginId}" is not installed`);

  invalidateInstalledPluginCache(userId);

  return {
    plugin: buildPluginStoreEntry(registered, row),
    pluginId: request.pluginId,
    installed: true,
    message: request.enabled
      ? `${registered.manifest.name} enabled`
      : `${registered.manifest.name} disabled`,
  };
}
