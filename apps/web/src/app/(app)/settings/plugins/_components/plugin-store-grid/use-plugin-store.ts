'use client';

// SPDX-License-Identifier: Apache-2.0

// Store state + lifecycle actions: search/category filtering, install,
// enable toggle, uninstall, and the setup-drawer selection.
import type { PluginCategory } from '@kestrel/plugin-sdk';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ApiError, apiFetch, apiMutate } from '@/lib/http/api-client';
import {
  PLUGIN_CATEGORY_ORDER,
  type PluginStoreEntry,
  type PluginStoreSnapshot,
} from '@/lib/plugins/types';

import { replaceEntry, type ManageResponse } from './plugin-store-utils';

export function usePluginStore({ initialSnapshot }: { initialSnapshot: PluginStoreSnapshot }) {
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

  return {
    query,
    setQuery,
    category,
    setCategory,
    busyId,
    selected,
    settingsOpen,
    setSettingsOpen,
    setSelectedId,
    uninstallEntry,
    uninstallId,
    setUninstallId,
    installed,
    available,
    categories,
    refresh,
    upsert,
    install,
    toggleEnabled,
    uninstall,
  };
}

export type PluginStoreController = ReturnType<typeof usePluginStore>;
