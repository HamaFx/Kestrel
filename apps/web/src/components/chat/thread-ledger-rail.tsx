'use client';

// SPDX-License-Identifier: Apache-2.0

// Left research ledger rail for /chat on wide desktops: every conversation
// grouped by its pinned symbol, one click away, without opening a drawer.
// The full ThreadSwitcher (search + bulk delete) stays one footer tap away.
import { IconLayoutSidebar, IconPlus, IconSearch } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useTime } from '@/components/providers/time-provider';
import { cn } from '@/lib/formatters/cn';

import { ThreadSwitcher } from './_components/thread-switcher';
import type { ThreadSummary } from './chat-top-bar';

interface ThreadLedgerRailProps {
  threads: ThreadSummary[];
  threadId: string;
  onCollapse: () => void;
}

export function ThreadLedgerRail({ threads, threadId, onCollapse }: ThreadLedgerRailProps) {
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { formatRelative } = useTime();

  const groups = useMemo(() => {
    const byGroup = new Map<string, ThreadSummary[]>();
    for (const thread of threads) {
      const key = thread.pinnedSymbol ?? 'GENERAL';
      byGroup.set(key, [...(byGroup.get(key) ?? []), thread]);
    }
    return [...byGroup.entries()];
  }, [threads]);

  return (
    <aside
      aria-label="Research ledger"
      className="hidden shrink-0 flex-col border-r border-white/[0.07] bg-[#101113] xl:flex xl:w-[228px]"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex items-center gap-1.5">
          <span className="text-fg-subtle font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">
            Research ledger
          </span>
          <span className="bg-white/[0.06] text-fg-subtle rounded px-1 font-mono text-[9px] tabular-nums">
            {threads.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Link
            href="/chat?new=1"
            aria-label="New research thread"
            title="New thread"
            className="text-fg-subtle hover:bg-bg-elev-3 hover:text-brand inline-flex size-7 items-center justify-center rounded-md transition-colors"
          >
            <IconPlus className="size-3.5" />
          </Link>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse research ledger"
            title="Collapse rail"
            className="text-fg-subtle hover:bg-bg-elev-3 hover:text-fg inline-flex size-7 items-center justify-center rounded-md transition-colors"
          >
            <IconLayoutSidebar className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="scrollbar-hide flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="text-fg-subtle px-2 py-3 font-mono text-[10px]">No research threads yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map(([group, items]) => (
              <section key={group} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between px-1.5 pb-1">
                  <span className="text-fg-subtle/70 font-mono text-[9px] font-semibold tracking-[0.16em] uppercase">
                    {group === 'GENERAL' ? 'General' : group}
                  </span>
                  <span className="text-fg-subtle/50 font-mono text-[9px] tabular-nums">
                    {items.length}
                  </span>
                </div>
                {items.map((thread) => {
                  const active = thread.id === threadId;
                  return (
                    <Link
                      key={thread.id}
                      href={`/chat/${thread.id}`}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-9 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                        active
                          ? 'border-brand/40 bg-bg-elev-2 text-fg font-medium'
                          : 'text-fg-muted hover:border-white/[0.1] hover:bg-white/[0.03] hover:text-fg border-transparent',
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {thread.title ?? 'Untitled research'}
                      </span>
                      <span className="text-fg-subtle/60 shrink-0 font-mono text-[9px] tabular-nums">
                        {formatRelative(thread.updatedAt)}
                      </span>
                    </Link>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] p-2">
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 inline-flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left font-mono text-[10px] transition-colors"
        >
          <IconSearch className="size-3.5" />
          All conversations &amp; bulk actions
        </button>
      </div>

      <ThreadSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        threadId={threadId}
        threads={threads}
        onPickNew={() => {
          setSwitcherOpen(false);
          router.push('/chat?new=1');
        }}
      />
    </aside>
  );
}
