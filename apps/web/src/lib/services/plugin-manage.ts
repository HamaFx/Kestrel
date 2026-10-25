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

// Plugin Store management service.
//
// One place owns the install ledger, lifecycle hooks, settings encryption and
// cache invalidation. The route handler is a thin authenticated controller;
// server components use `buildPluginStoreSnapshot` directly.

import { createPluginExecutionContext, invalidateInstalledPluginCache } from '@kestrel/ai/plugins';
import {
  getInstalledPlugin,
  installPlugin,
  listInstalledPlugins,
  pluginStorageGet,
  pluginStorageSet,
  requireTenantIdForUser,
  setPluginEnabled,
  uninstallPlugin,
  updatePluginSettings,
  withRateLimit,
  withTenantDb,
  type InstalledPluginRow,
} from '@kestrel/db';
import {
  describePluginSettingsSchema,
  pluginHost,
  type KestrelPluginManifest,
  type RegisteredPlugin,
} from '@kestrel/plugin-sdk';
import {
  decryptPluginSettings,
  maskPluginSettings,
  preparePluginSettings,
} from '@kestrel/plugin-sdk/settings';
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import { ensureBundledPluginsRegistered } from '@kestrel/plugins';
import { registerBundledPluginUi } from '@kestrel/plugins/ui';
import { notFound, providerUnavailable, rateLimited } from '@kestrel/shared/errors';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import type {
  PluginInstallRequest,
  PluginManageResponse,
  PluginSetEnabledRequest,
  PluginUninstallRequest,
  PluginUpdateSettingsRequest,
} from '../plugins/manage-schema';
import type {
  PluginCapabilitySummary,
  PluginStoreEntry,
  PluginStoreSnapshot,
} from '../plugins/types';

// Populate nav/widget metadata on the server too, so the Store can show
// "Open" links and sidebar-tab badges without a client round-trip.
registerBundledPluginUi();
// Defensive: instrumentation normally registers the capability host first.
// A route invoked without that boot path (CLI, isolated test, cold chunk)
// must still see the bundled plugins.
try {
  ensureBundledPluginsRegistered();
} catch (err) {
  console.error('[plugin-manage] bundled plugin registration failed', err);
}

const MANAGE_RATE_LIMIT_PER_MINUTE = 30;

/** Snapshot kept in plugin_storage when a user uninstalls without wiping. */
const INSTALL_STATE_COLLECTION = 'install-state';
const INSTALL_STATE_KEY = 'settings';

/** Shared fixed-window guard for every Plugin Store mutation. */
export async function enforcePluginManageRateLimit(userId: string): Promise<void> {
  const limit = await withRateLimit(userId, 'plugin_manage', MANAGE_RATE_LIMIT_PER_MINUTE);
  if (!limit.allowed) {
    throw rateLimited('Too many plugin changes. Please wait a minute and try again.');
  }
}

const plog = createCategorizedLogger('api', { component: 'plugin-manage' });

function skillName(skill: RegisteredPlugin['skills'][number]): {
  name: string;
  description?: string;
  path?: string;
} {
  if (typeof skill === 'string') {
    const normalized = skill.replaceAll('\\', '/').replace(/\/+$/, '');
    const name = normalized.split('/').filter(Boolean).at(-1) ?? normalized;
    return { name, path: skill };
  }
  return {
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
  };
}

function capabilitiesFor(registered: RegisteredPlugin): PluginCapabilitySummary {
  const ui = pluginUiRegistry.get(registered.manifest.id);
  return {
    tools: registered.tools.length,
    skills: registered.skills.length,
    jobs: registered.jobs.length,
    tickSubscribers: registered.tickSubscribers.length,
    alertChannels: registered.alertChannels.length,
    indicators: registered.indicators.length,
    agents: registered.agents.length,
    packetEnrichers: registered.packetEnrichers.length,
    apiRoutes: Object.keys(pluginHost.getApiRoutes(registered.manifest.id) ?? {}).length,
    navItems: ui?.navItems?.length ?? 0,
    dashboardWidgets: ui?.dashboardWidgets?.length ?? 0,
    slashCommands: ui?.slashCommands?.length ?? 0,
  };
}

function computedBadges(capabilities: PluginCapabilitySummary): string[] {
  const badges: string[] = [];
  if (capabilities.tools > 0) {
    badges.push(`${capabilities.tools} AI tool${capabilities.tools === 1 ? '' : 's'}`);
  }
  if (capabilities.skills > 0) {
    badges.push(`${capabilities.skills} skill${capabilities.skills === 1 ? '' : 's'}`);
  }
  if (capabilities.navItems > 0) {
    badges.push(`${capabilities.navItems} sidebar tab${capabilities.navItems === 1 ? '' : 's'}`);
  }
  if (capabilities.dashboardWidgets > 0) {
    badges.push(
      `${capabilities.dashboardWidgets} dashboard widget${
        capabilities.dashboardWidgets === 1 ? '' : 's'
      }`,
    );
  }
  if (capabilities.jobs > 0) {
    badges.push(`${capabilities.jobs} scheduled job${capabilities.jobs === 1 ? '' : 's'}`);
  }
  return badges;
}

function decryptedRowSettings(
  manifest: KestrelPluginManifest,
  row: InstalledPluginRow | undefined,
): Record<string, unknown> {
  if (!row) return {};
  return decryptPluginSettings(
    manifest.settingsSchema,
    row.settings && typeof row.settings === 'object' ? row.settings : {},
  );
}

/**
 * Run a plugin-table read inside the caller's tenant transaction.
 *
 * API routes already have one from `withAuth`; server components do not, so
 * this wrapper resolves the tenant and sets the RLS GUC either way.
 */
async function withUserTenant<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const tenantId = await requireTenantIdForUser(userId);
  return withTenantDb(tenantId, work, { userId });
}

export function buildPluginStoreEntry(
  registered: RegisteredPlugin,
  row: InstalledPluginRow | undefined,
): PluginStoreEntry {
  const manifest = registered.manifest;
  const capabilities = capabilitiesFor(registered);
  const plain = decryptedRowSettings(manifest, row);
  const description = describePluginSettingsSchema(manifest.settingsSchema);
  const ui = pluginUiRegistry.get(manifest.id);
  const primaryHref = ui?.navItems?.[0]?.href ?? null;

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    tagline: manifest.tagline,
    description: manifest.description,
    category: manifest.category,
    iconName: manifest.iconName,
    installMode: manifest.installMode,
    badges:
      manifest.badges && manifest.badges.length > 0
        ? [...manifest.badges]
        : computedBadges(capabilities),
    capabilities,
    tools: registered.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      access: tool.access,
    })),
    skills: registered.skills.map(skillName),
    installed: row !== undefined,
    enabled: row?.enabled ?? false,
    onboardingCompleted: row?.onboardingCompleted ?? false,
    installedAt: row?.installedAt ? row.installedAt.toISOString() : null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    settings: maskPluginSettings(manifest.settingsSchema, plain),
    settingsFields: description.fields,
    setupSteps: manifest.setupSteps ?? [],
    primaryHref,
  };
}

/** Every registered plugin + this user's install state, ready for the Store. */
export async function buildPluginStoreSnapshot(userId: string): Promise<PluginStoreSnapshot> {
  const rows = await withUserTenant(userId, () => listInstalledPlugins(userId));
  const rowByPluginId = new Map(rows.map((row) => [row.pluginId, row]));

  const plugins: PluginStoreEntry[] = [];
  for (const manifest of pluginHost.listAvailablePlugins()) {
    const registered = pluginHost.getPlugin(manifest.id);
    if (!registered) continue;
    plugins.push(buildPluginStoreEntry(registered, rowByPluginId.get(manifest.id)));
  }

  return { plugins, installedCount: rows.length };
}

export interface PluginShellContext {
  /** Enabled plugin ids, in install order. */
  installedPluginIds: string[];
  /** Masked per-plugin settings for client widgets (never contains secrets). */
  pluginSettings: Record<string, Record<string, unknown>>;
}

/**
 * Lightweight install context for the app shell (sidebar, ⌘K, dashboard).
 *
 * Secrets are masked before crossing the server/client boundary; a plugin
 * dashboard widget must render from non-secret settings or fetch its own data
 * through an authenticated plugin API route.
 */
export async function buildPluginShellContext(userId: string): Promise<PluginShellContext> {
  let rows: InstalledPluginRow[];
  try {
    rows = await withUserTenant(userId, () => listInstalledPlugins(userId));
  } catch (err) {
    plog.warn('plugin shell context unavailable; continuing core-only', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { installedPluginIds: [], pluginSettings: {} };
  }

  const pluginSettings: Record<string, Record<string, unknown>> = {};
  const installedPluginIds: string[] = [];

  for (const row of rows) {
    const manifest = pluginHost.getPlugin(row.pluginId)?.manifest;
    const plain = decryptPluginSettings(
      manifest?.settingsSchema,
      row.settings && typeof row.settings === 'object' ? row.settings : {},
    );
    pluginSettings[row.pluginId] = manifest
      ? maskPluginSettings(manifest.settingsSchema, plain)
      : plain;
    if (row.enabled) installedPluginIds.push(row.pluginId);
  }

  return { installedPluginIds, pluginSettings };
}

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
