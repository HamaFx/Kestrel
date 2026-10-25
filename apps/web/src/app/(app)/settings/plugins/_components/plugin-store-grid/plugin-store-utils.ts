// SPDX-License-Identifier: Apache-2.0

// Shared helpers + response shape for the plugin store.

import type { PluginStoreEntry } from '@/lib/plugins/types';

export type ManageResponse = {
  plugin: PluginStoreEntry | null;
  pluginId: string;
  installed: boolean;
  message: string;
  warning?: string;
};

export function capabilityLine(entry: PluginStoreEntry): string {
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

export function replaceEntry(
  entries: readonly PluginStoreEntry[],
  next: PluginStoreEntry,
): PluginStoreEntry[] {
  const found = entries.some((entry) => entry.id === next.id);
  return found ? entries.map((entry) => (entry.id === next.id ? next : entry)) : [...entries, next];
}
