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
import { IconSparkles } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import type { PluginStoreSnapshot } from '@/lib/plugins/types';

import { PluginSetupDrawer } from '../plugin-setup-drawer';
import { PluginCard } from './plugin-card';
import { StoreToolbar } from './store-toolbar';
import { UninstallDrawer } from './uninstall-drawer';
import { usePluginStore } from './use-plugin-store';

export interface PluginStoreGridProps {
  initialSnapshot: PluginStoreSnapshot;
}

export function PluginStoreGrid({ initialSnapshot }: PluginStoreGridProps) {
  const store = usePluginStore({ initialSnapshot });
  const {
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
  } = store;

  return (
    <div className="flex flex-col gap-6">
      <StoreToolbar
        query={query}
        onQuery={setQuery}
        category={category}
        onCategory={setCategory}
        categories={categories}
      />

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
