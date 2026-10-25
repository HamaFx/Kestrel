'use client';

// SPDX-License-Identifier: Apache-2.0

// Palette result list: grouped sections, keyboard-active rows and match
// highlighting. Presentation only — ranking lives in use-command-registry.
import type { CommandGroup, CommandItem } from '@/lib/commands';
import { cn } from '@/lib/formatters/cn';

import { GROUP_LABELS, GROUP_ORDER, type CommandRow } from './command-groups';

export function CommandResults({
  grouped,
  flatRows,
  activeIdx,
  setActiveIdx,
  onRun,
}: {
  grouped: Record<CommandGroup, CommandRow[]>;
  flatRows: CommandRow[];
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  onRun: (cmd: CommandItem) => void;
}) {
  return (
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
                        onClick={() => onRun(command)}
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
