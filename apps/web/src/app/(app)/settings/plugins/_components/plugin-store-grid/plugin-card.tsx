'use client';

// SPDX-License-Identifier: Apache-2.0

// Single plugin card: identity, capability summary, and lifecycle actions.
import {
  IconExternalLink,
  IconLoader2,
  IconPuzzle,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { pluginIcon } from '@/components/plugins/plugin-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PLUGIN_CATEGORY_LABELS, type PluginStoreEntry } from '@/lib/plugins/types';

import { capabilityLine } from './plugin-store-utils';

export function PluginCard({
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
