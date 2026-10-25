// SPDX-License-Identifier: Apache-2.0
// Builds the palette command corpus: static commands plus installed-plugin
// nav items, ranked by query and grouped for rendering.

import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import { useMemo } from 'react';

import { pluginIcon } from '@/components/plugins/plugin-icon';
import { COMMANDS, type CommandGroup, type CommandItem } from '@/lib/commands';
import { rankByQuery } from '@/lib/formatters/fuzzy-match';

import { GROUP_ORDER, type CommandRow } from './command-groups';

export function useCommandRegistry(installedPluginIds: readonly string[], query: string) {
  const pluginCommands = useMemo<CommandItem[]>(
    () =>
      pluginUiRegistry.listNavItems(installedPluginIds).map(({ pluginId, item }) => ({
        id: `plugin-${pluginId}-${item.href}`,
        group: 'plugins',
        label: item.label,
        icon: pluginIcon(item.iconName),
        href: item.href,
        keywords: [pluginId, ...(item.description ? [item.description] : [])],
      })),
    [installedPluginIds],
  );

  const allCommands = useMemo(() => [...COMMANDS, ...pluginCommands], [pluginCommands]);

  const corpus = useMemo(() => {
    type Row = { item: CommandItem; label: string; displayLabel: string };
    const rows: Row[] = allCommands.map((c) => ({
      item: c,
      label: [c.label, ...(c.keywords ?? [])].join(' '),
      displayLabel: c.label,
    }));
    return rows;
  }, [allCommands]);

  const ranked = useMemo(() => {
    const matches = rankByQuery(query, corpus);
    return matches.map(({ item, match }) => {
      const labelIndices = match.indices.filter((i) => i < item.displayLabel.length);
      return { command: item.item, match, labelIndices };
    });
  }, [query, corpus]);

  const grouped = useMemo(() => {
    const out: Record<CommandGroup, CommandRow[]> = {
      navigation: [],
      create: [],
      plugins: [],
      settings: [],
    };
    for (const r of ranked)
      out[r.command.group].push({ command: r.command, labelIndices: r.labelIndices });
    return out;
  }, [ranked]);

  const flatRows = useMemo(() => {
    const out: CommandRow[] = [];
    for (const group of GROUP_ORDER) {
      for (const row of grouped[group]) out.push(row);
    }
    return out;
  }, [grouped]);

  return { grouped, flatRows };
}
