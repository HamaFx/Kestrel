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
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import { IconCommand, IconSearch } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { pluginIcon } from '@/components/plugins/plugin-icon';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { COMMANDS, type CommandGroup, type CommandItem } from '@/lib/commands';
import { cn } from '@/lib/formatters/cn';
import { rankByQuery } from '@/lib/formatters/fuzzy-match';

import '@/lib/plugins/register-ui';

const GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: 'Navigate',
  create: 'Create',
  plugins: 'Plugins',
  settings: 'Settings',
};
const GROUP_ORDER: CommandGroup[] = ['navigation', 'create', 'plugins', 'settings'];

export interface CommandPaletteProps {
  /**
   * Imperative handler for the "new chat" command. When not provided,
   * falls back to navigating to `/chat?new=1`.
   */
  onNewChat?: () => void;
  /** Installed plugins whose nav items should appear in the palette. */
  installedPluginIds?: readonly string[];
}

export function CommandPalette({ onNewChat, installedPluginIds = [] }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Keyboard shortcut listener.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset state every time the drawer opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const runCommand = useCallback(
    (cmd: CommandItem) => {
      setOpen(false);
      if (cmd.id === 'create-chat') {
        if (onNewChat) {
          onNewChat();
        } else {
          router.push('/chat?new=1');
        }
        return;
      }
      if (cmd.action) {
        cmd.action();
        return;
      }
      if (cmd.href) {
        router.push(cmd.href);
      }
    },
    [router, onNewChat],
  );

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
    const out: Record<CommandGroup, Array<{ command: CommandItem; labelIndices: number[] }>> = {
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
    const out: Array<{ command: CommandItem; labelIndices: number[] }> = [];
    for (const group of GROUP_ORDER) {
      for (const row of grouped[group]) out.push(row);
    }
    return out;
  }, [grouped]);

  useEffect(() => {
    if (flatRows.length > 0 && activeIdx >= flatRows.length) {
      setActiveIdx(0);
    }
  }, [flatRows.length, activeIdx]);

  useEffect(() => {
    if (!open) return;
    const activeEl = document.querySelector(`[data-command-idx="${activeIdx}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx, open]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (flatRows.length === 0 ? 0 : (i + 1) % flatRows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) =>
        flatRows.length === 0 ? 0 : (i - 1 + flatRows.length) % flatRows.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatRows[activeIdx];
      if (target) runCommand(target.command);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <>
      <span data-command-palette-ready="true" aria-hidden="true" className="hidden" />
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[80svh]">
          <DrawerHeader>
            <DrawerTitle>
              <span className="flex items-center gap-2">
                <IconCommand className="size-4" aria-hidden="true" />
                Quick switch
              </span>
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-3">
            <label htmlFor={inputId} className="sr-only">
              Search commands
            </label>
            <div className="relative">
              <IconSearch
                aria-hidden="true"
                className="text-fg-subtle absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <input
                ref={inputRef}
                id={inputId}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls="command-listbox"
                aria-activedescendant={
                  activeIdx >= 0 && flatRows.length > 0 ? `command-option-${activeIdx}` : undefined
                }
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Jump to page or action…"
                autoComplete="off"
                spellCheck={false}
                className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:border-border border-border h-11 w-full rounded-sm border pr-4 pl-10 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div
            id="command-listbox"
            role="listbox"
            aria-label="Command results"
            aria-describedby="command-result-count"
            className="scrollbar-hide flex max-h-[50svh] flex-col overflow-y-auto px-2 pb-4"
          >
            <p id="command-result-count" className="sr-only" role="status" aria-live="polite">
              {flatRows.length} command{flatRows.length === 1 ? '' : 's'} available
            </p>
            {flatRows.length === 0 ? (
              <p
                className="text-fg-subtle px-3 py-6 text-center text-sm"
                role="status"
                aria-live="polite"
              >
                No commands match.
              </p>
            ) : (
              GROUP_ORDER.map((group) => {
                const rows = grouped[group];
                if (rows.length === 0) return null;
                return (
                  <section key={group} aria-labelledby={`cmd-group-${group}`} className="mb-2">
                    <h3
                      id={`cmd-group-${group}`}
                      className="text-fg-subtle text-caption px-3 pt-2 pb-1 font-medium tracking-wide uppercase"
                    >
                      {GROUP_LABELS[group]}
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {rows.map(({ command, labelIndices }) => {
                        const flatIndex = flatRows.findIndex((r) => r.command.id === command.id);
                        const isActive = flatIndex === activeIdx;
                        const Icon = command.icon;
                        return (
                          <li key={command.id} role="presentation">
                            <button
                              id={`command-option-${flatIndex}`}
                              type="button"
                              role="option"
                              aria-selected={activeIdx === flatIndex}
                              tabIndex={-1}
                              data-command-idx={flatIndex}
                              onClick={() => runCommand(command)}
                              onMouseEnter={() => setActiveIdx(flatIndex)}
                              className={cn(
                                'flex min-h-[44px] w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm transition-colors',
                                isActive
                                  ? 'bg-bg-elev-3 text-fg'
                                  : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
                              )}
                            >
                              <span
                                aria-hidden="true"
                                className="text-fg-muted bg-bg-elev-2 inline-flex size-8 shrink-0 items-center justify-center rounded-sm"
                              >
                                <Icon className="size-4" strokeWidth={1.75} />
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                <HighlightedLabel label={command.label} indices={labelIndices} />
                              </span>
                              {command.shortcut ? (
                                <kbd className="bg-bg-elev-2 ring-divider text-caption rounded-sm border px-1.5 font-mono ring-1">
                                  {command.shortcut}
                                </kbd>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {isTouch ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open command palette"
          className="bg-bg-elev-2 text-fg-muted border-border hover:bg-bg-elev-3 hover:text-fg focus-visible:ring-brand fixed right-4 bottom-24 z-30 inline-flex size-12 items-center justify-center rounded-sm border shadow-md focus-visible:ring-2 focus-visible:outline-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
        >
          <IconCommand className="size-5" aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}

function HighlightedLabel({ label, indices }: { label: string; indices: number[] }) {
  if (indices.length === 0) return <>{label}</>;
  const idxSet = new Set(indices);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < label.length; i += 1) {
    const ch = label[i];
    if (idxSet.has(i)) {
      out.push(
        <mark key={i} className="bg-fg/20 text-fg rounded-sm px-0.5">
          {ch}
        </mark>,
      );
    } else {
      out.push(<span key={i}>{ch}</span>);
    }
  }
  return <>{out}</>;
}
