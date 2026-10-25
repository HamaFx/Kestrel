'use client';

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

// 1-click Plugin Store.
//
// Installed plugins are shown first with their health/setup state. Available
// plugins are grouped by capability. Every mutation goes through
// /api/plugins/manage; the route performs lifecycle hooks, encryption and
// runtime-cache invalidation, then returns the updated serialisable entry.
import type { PluginCategory } from '@kestrel/plugin-sdk';
import {
  IconAlertTriangle,
  IconExternalLink,
  IconLoader2,
  IconPuzzle,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { pluginIcon } from '@/components/plugins/plugin-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ApiError, apiFetch, apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import {
  PLUGIN_CATEGORY_LABELS,
  PLUGIN_CATEGORY_ORDER,
  type PluginStoreEntry,
  type PluginStoreSnapshot,
} from '@/lib/plugins/types';

import { PluginSetupDrawer } from './plugin-setup-drawer';

export interface PluginStoreGridProps {
  initialSnapshot: PluginStoreSnapshot;
}

type ManageResponse = {
  plugin: PluginStoreEntry | null;
  pluginId: string;
  installed: boolean;
  message: string;
  warning?: string;
};

function capabilityLine(entry: PluginStoreEntry): string {
  const parts: string[] = [];
  const c = entry.capabilities;
  if (c.tools > 0) parts.push(`${c.tools} tool${c.tools === 1 ? '' : 's'}`);
  if (c.skills > 0) parts.push(`${c.skills} skill${c.skills === 1 ? '' : 's'}`);
  if (c.jobs > 0) parts.push(`${c.jobs} job${c.jobs === 1 ? '' : 's'}`);
  if (c.agents > 0) parts.push(`${c.agents} agent${c.agents === 1 ? '' : 's'}`);
  if (c.alertChannels > 0)
    parts.push(`${c.alertChannels} channel${c.alertChannels === 1 ? '' : 's'}`);
  if (c.indicators > 0) parts.push(`${c.indicators} indicator${c.indicators === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' · ') : 'Core workspace extension';
}

function replaceEntry(
  entries: readonly PluginStoreEntry[],
  next: PluginStoreEntry,
): PluginStoreEntry[] {
  const found = entries.some((entry) => entry.id === next.id);
  return found ? entries.map((entry) => (entry.id === next.id ? next : entry)) : [...entries, next];
}

function PluginCard({
  entry,
  busy,
  onInstall,
  onManage,
  onToggleEnabled,
  onUninstall,
}: {
  entry: PluginStoreEntry;
  busy: boolean;
  onInstall: () => void;
  onManage: () => void;
  onToggleEnabled: () => void;
  onUninstall: () => void;
}) {
  const Icon = pluginIcon(entry.iconName);
  const setupNeeded = entry.installed && entry.enabled && !entry.onboardingCompleted;
  const statusTone = !entry.installed
    ? 'neutral'
    : !entry.enabled
      ? 'warn'
      : setupNeeded
        ? 'brand'
        : 'success';
  const statusLabel = !entry.installed
    ? 'Available'
    : !entry.enabled
      ? 'Disabled'
      : setupNeeded
        ? 'Setup needed'
        : 'Installed';

  return (
    <article className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex items-start gap-3">
        <span className="bg-bg-elev-2 text-fg-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-5.5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-fg truncate text-base font-semibold tracking-tight">
              {entry.name}
            </h3>
            <span className="text-fg-subtle font-mono text-[11px]">v{entry.version}</span>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>
          <p className="text-fg-subtle text-sm leading-snug">{entry.tagline}</p>
        </div>
      </div>

      <p className="text-fg-muted text-xs leading-relaxed">{entry.description}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {entry.badges.map((badge) => (
          <span
            key={badge}
            className="border-border/70 bg-bg-elev-1/60 text-fg-subtle rounded-md border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase"
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="border-border/50 text-fg-subtle flex items-center justify-between gap-2 border-t pt-3 text-[11px]">
        <span className="truncate">{capabilityLine(entry)}</span>
        <span className="shrink-0 font-mono uppercase">
          {PLUGIN_CATEGORY_LABELS[entry.category]}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {entry.installed ? (
          <>
            <Button type="button" size="sm" variant="primary" onClick={onManage} disabled={busy}>
              {busy ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconSettings className="size-4" />
              )}
              {setupNeeded ? 'Finish setup' : 'Manage'}
            </Button>
            {entry.primaryHref && entry.enabled ? (
              <Link
                href={entry.primaryHref}
                className="text-fg-muted hover:text-fg border-border/60 inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors"
              >
                <IconExternalLink className="size-3.5" />
                Open
              </Link>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onToggleEnabled}
              disabled={busy}
            >
              {entry.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onUninstall}
              disabled={busy}
              className="text-fg-subtle hover:text-danger"
            >
              <IconTrash className="size-4" />
              Uninstall
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="primary" onClick={onInstall} disabled={busy}>
            {busy ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconPuzzle className="size-4" />
            )}
            {entry.installMode === 'wizard' ? 'Install & set up' : 'Install plugin'}
          </Button>
        )}
      </div>
    </article>
  );
}

function UninstallDrawer({
  entry,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  entry: PluginStoreEntry | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (wipeData: boolean) => void;
}) {
  const [wipeData, setWipeData] = useState(false);

  useEffect(() => {
    if (!open) setWipeData(false);
  }, [open]);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setWipeData(false);
        onOpenChange(next);
      }}
    >
      <DrawerContent className="surface-panel border-border rounded-t-xl border-t">
        <DrawerHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="text-danger bg-danger/10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
            >
              <IconAlertTriangle className="size-5" />
            </span>
            <div className="min-w-0">
              <DrawerTitle>Uninstall {entry?.name}?</DrawerTitle>
              <DrawerDescription className="mt-1">
                Its tools, nav items and scheduled jobs stop immediately for your account.
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-2">
          <div className="border-border/60 bg-bg-elev-1/50 flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wipe-plugin-data" className="text-fg text-sm font-semibold">
                Also delete saved plugin data
              </label>
              <p className="text-fg-subtle text-xs">
                Removes this plugin&apos;s stored documents and settings. This cannot be undone.
              </p>
            </div>
            <Switch
              id="wipe-plugin-data"
              checked={wipeData}
              onCheckedChange={setWipeData}
              srLabel="Also delete saved plugin data"
            />
          </div>
        </div>

        <DrawerFooter>
          <Button
            type="button"
            variant="danger"
            onClick={() => onConfirm(wipeData)}
            disabled={busy}
            className="w-full"
          >
            {busy ? 'Uninstalling…' : wipeData ? 'Uninstall & delete data' : 'Uninstall plugin'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="w-full"
          >
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function PluginStoreGrid({ initialSnapshot }: PluginStoreGridProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<PluginStoreEntry[]>([...initialSnapshot.plugins]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PluginCategory | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uninstallId, setUninstallId] = useState<string | null>(null);

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const uninstallEntry = entries.find((entry) => entry.id === uninstallId) ?? null;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category !== 'all' && entry.category !== category) return false;
      if (normalized.length === 0) return true;
      return [entry.name, entry.id, entry.tagline, entry.description, ...entry.badges]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [category, entries, query]);

  const installed = filtered.filter((entry) => entry.installed);
  const available = filtered.filter((entry) => !entry.installed);

  const categories = useMemo(() => {
    const present = new Set(entries.map((entry) => entry.category));
    return PLUGIN_CATEGORY_ORDER.filter((value) => present.has(value));
  }, [entries]);

  async function refresh(): Promise<PluginStoreEntry | null> {
    try {
      const snapshot = await apiFetch<PluginStoreSnapshot>('/api/plugins/manage');
      setEntries([...snapshot.plugins]);
      return snapshot.plugins.find((entry) => entry.id === selectedId) ?? null;
    } catch {
      return null;
    }
  }

  function upsert(next: PluginStoreEntry | null) {
    if (!next) return;
    setEntries((current) => replaceEntry(current, next));
  }

  async function mutate(body: Record<string, unknown>): Promise<ManageResponse | null> {
    try {
      return await apiMutate<ManageResponse>('/api/plugins/manage', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error('Plugin action failed', { description: err.message });
      } else {
        toast.error('Plugin action failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      return null;
    }
  }

  async function install(entry: PluginStoreEntry) {
    setBusyId(entry.id);
    try {
      const response = await mutate({ action: 'install', pluginId: entry.id });
      if (!response?.plugin) return;
      upsert(response.plugin);
      toast.success(response.message, {
        description:
          entry.installMode === 'wizard'
            ? 'Continue with the guided setup.'
            : 'Its tools and workspace slots are now active.',
      });
      if (entry.installMode === 'wizard') {
        setSelectedId(entry.id);
        setSettingsOpen(true);
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEnabled(entry: PluginStoreEntry) {
    setBusyId(entry.id);
    try {
      const response = await mutate({
        action: 'set-enabled',
        pluginId: entry.id,
        enabled: !entry.enabled,
      });
      if (response?.plugin) upsert(response.plugin);
      if (response) toast.success(response.message);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function uninstall(wipeData: boolean) {
    const entry = uninstallEntry;
    if (!entry) return;
    setBusyId(entry.id);
    try {
      const response = await mutate({
        action: 'uninstall',
        pluginId: entry.id,
        wipeData,
      });
      if (response) {
        upsert(response.plugin);
        toast.success(response.message, {
          ...(response.warning ? { description: response.warning } : {}),
        });
      }
      setUninstallId(null);
      if (selectedId === entry.id) setSettingsOpen(false);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <IconSearch
            aria-hidden
            className="text-fg-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plugins, capabilities, or tools…"
            aria-label="Search plugins"
            className="pl-10"
          />
        </div>

        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory('all')}
            aria-pressed={category === 'all'}
            className={cn(
              'min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors',
              category === 'all'
                ? 'bg-brand/12 text-brand ring-brand/30 ring-1'
                : 'text-fg-subtle bg-bg-elev-1/70 hover:text-fg border border-white/5',
            )}
          >
            All
          </button>
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={cn(
                'min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors',
                category === value
                  ? 'bg-brand/12 text-brand ring-brand/30 ring-1'
                  : 'text-fg-subtle bg-bg-elev-1/70 hover:text-fg border border-white/5',
              )}
            >
              {PLUGIN_CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {installed.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="installed-plugins-heading">
          <div className="flex items-center gap-2 px-0.5">
            <h2
              id="installed-plugins-heading"
              className="text-fg-subtle text-[11px] font-semibold tracking-wider uppercase"
            >
              Installed plugins
            </h2>
            <Badge tone="neutral">{installed.length}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {installed.map((entry) => (
              <PluginCard
                key={entry.id}
                entry={entry}
                busy={busyId === entry.id}
                onInstall={() => void install(entry)}
                onManage={() => {
                  setSelectedId(entry.id);
                  setSettingsOpen(true);
                }}
                onToggleEnabled={() => void toggleEnabled(entry)}
                onUninstall={() => setUninstallId(entry.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="available-plugins-heading">
        <div className="flex items-center gap-2 px-0.5">
          <h2
            id="available-plugins-heading"
            className="text-fg-subtle text-[11px] font-semibold tracking-wider uppercase"
          >
            {installed.length > 0 ? 'More plugins' : 'Available plugins'}
          </h2>
          <Badge tone="neutral">{available.length}</Badge>
        </div>

        {available.length === 0 ? (
          <div className="border-border/60 bg-bg-elev-1/40 flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <IconSparkles className="text-fg-subtle size-6" />
            <p className="text-fg text-sm font-semibold">No plugins match this view</p>
            <p className="text-fg-subtle max-w-sm text-xs">
              Try clearing the search or choosing a different capability group. New plugins appear
              here automatically when they ship in the monorepo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {available.map((entry) => (
              <PluginCard
                key={entry.id}
                entry={entry}
                busy={busyId === entry.id}
                onInstall={() => void install(entry)}
                onManage={() => {
                  setSelectedId(entry.id);
                  setSettingsOpen(true);
                }}
                onToggleEnabled={() => void toggleEnabled(entry)}
                onUninstall={() => setUninstallId(entry.id)}
              />
            ))}
          </div>
        )}
      </section>

      <PluginSetupDrawer
        entry={selected}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChanged={(next) => upsert(next)}
        onRefresh={async () => {
          const next = await refresh();
          if (next) setSelectedId(next.id);
          return next;
        }}
      />

      <UninstallDrawer
        entry={uninstallEntry}
        open={uninstallId !== null}
        busy={busyId === uninstallEntry?.id}
        onOpenChange={(open) => {
          if (!open) setUninstallId(null);
        }}
        onConfirm={(wipeData) => void uninstall(wipeData)}
      />
    </div>
  );
}
