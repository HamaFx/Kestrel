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

// <CommandPalette> — global ⌘K drawer shell: search input, grouped result
// list and the touch launcher. State lives in use-command-palette.
import { IconCommand, IconSearch } from '@tabler/icons-react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

import '@/lib/plugins/register-ui';

import { CommandResults } from './command-results';
import { useCoarsePointer } from './use-coarse-pointer';
import { useCommandListNavigation } from './use-command-list-navigation';
import { useCommandPalette } from './use-command-palette';
import { useCommandRegistry } from './use-command-registry';

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
  const isTouch = useCoarsePointer();
  const { open, setOpen, query, setQuery, activeIdx, setActiveIdx, inputRef, inputId, runCommand } =
    useCommandPalette({ onNewChat });
  const { grouped, flatRows } = useCommandRegistry(installedPluginIds, query);
  const { onInputKeyDown } = useCommandListNavigation({
    open,
    activeIdx,
    setActiveIdx,
    flatRows,
    runCommand,
    setOpen,
  });

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

          <CommandResults
            grouped={grouped}
            flatRows={flatRows}
            activeIdx={activeIdx}
            setActiveIdx={setActiveIdx}
            onRun={runCommand}
          />
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
