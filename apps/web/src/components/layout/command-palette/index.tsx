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
import { IconCommand, IconSearch, IconX } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { MOTION_PRESETS } from '@/components/ui/motion-config';

import '@/lib/plugins/register-ui';

import { useShellRoute } from '../shell-route-context';
import { CommandPreview } from './command-preview';
import { CommandResults } from './command-results';
import { CommandTouchLauncher } from './command-touch-launcher';
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
  const { isChat } = useShellRoute();
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

  const activeCommand = flatRows[activeIdx]?.command;

  return (
    <>
      <span data-command-palette-ready="true" aria-hidden="true" className="hidden" />

      {/* Mobile Coarse Pointer: Bottom Sheet Drawer (Vaul) */}
      {isTouch ? (
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
      ) : (
        /* Desktop: Raycast/Linear-Style Dual-Pane Spotlight Modal */
        <AnimatePresence>
          {open && (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] sm:pt-[14vh]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="desktop-cmd-title"
            >
              {/* Backdrop */}
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-black/75 backdrop-blur-md"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />

              {/* Spotlight Dialog Shell */}
              <m.div
                initial={{ opacity: 0, scale: 0.96, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={MOTION_PRESETS.panel}
                className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141416]/95 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
              >
                <h2 id="desktop-cmd-title" className="sr-only">
                  Quick switch
                </h2>

                {/* Search Bar */}
                <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
                  <IconSearch className="size-5 shrink-0 text-brand" strokeWidth={2} />
                  <label htmlFor={inputId} className="sr-only">
                    Search commands
                  </label>
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
                    placeholder="Type a command, symbol, or search…"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-transparent text-base text-fg placeholder:text-fg-subtle focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <kbd className="rounded bg-bg-elev-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle border border-white/[0.06]">
                      ESC
                    </kbd>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close command palette"
                      className="rounded p-1 text-fg-subtle hover:text-fg transition-colors"
                    >
                      <IconX className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Dual-Pane Body */}
                <div className="grid grid-cols-12 min-h-[380px] max-h-[55vh]">
                  {/* Left Results Column */}
                  <div className="col-span-7 overflow-y-auto border-r border-white/[0.06] p-2">
                    <CommandResults
                      grouped={grouped}
                      flatRows={flatRows}
                      activeIdx={activeIdx}
                      setActiveIdx={setActiveIdx}
                      onRun={runCommand}
                    />
                  </div>

                  {/* Right Live-Preview Column */}
                  <div className="col-span-5 bg-bg-elev-1/30">
                    <CommandPreview command={activeCommand} />
                  </div>
                </div>

                {/* Footer Navigation Hints */}
                <div className="flex items-center justify-between border-t border-white/[0.06] bg-bg-elev-1/60 px-4 py-2 text-[11px] font-mono text-fg-subtle">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <kbd className="rounded bg-bg-elev-3 px-1 py-0.5 text-[9px] text-fg border border-white/[0.06]">↑</kbd>
                      <kbd className="rounded bg-bg-elev-3 px-1 py-0.5 text-[9px] text-fg border border-white/[0.06]">↓</kbd>
                      <span>Navigate</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="rounded bg-bg-elev-3 px-1.5 py-0.5 text-[9px] text-fg border border-white/[0.06]">↵</kbd>
                      <span>Select</span>
                    </span>
                  </div>
                  <span className="text-brand font-semibold">KESTREL COMMAND // ⌘K</span>
                </div>
              </m.div>
            </div>
          )}
        </AnimatePresence>
      )}

      {/* Touch launcher — suppressed on /chat so it never overlaps the composer
          or the scroll-to-bottom FAB. */}
      {isTouch && !isChat ? <CommandTouchLauncher onOpen={() => setOpen(true)} /> : null}
    </>
  );
}
