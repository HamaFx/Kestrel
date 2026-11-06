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

// Chat top bar: thread identity, sidecar toggle, new-chat action, and the
// conversation overflow menu. The sub-pieces live here because they share a
// single state machine and are never rendered independently.

import type { Symbol } from '@kestrel/shared';
import {
  IconChartCandle,
  IconDots,
  IconFileDownload,
  IconHistory,
  IconLayoutSidebarRight,
  IconLoader2,
  IconMessages,
  IconNotebook,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { NavTrigger } from '@/components/layout/nav-trigger';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { SymbolChip } from '@/components/ui/symbol-chip';
import { Tooltip } from '@/components/ui/tooltip';
import { usePopupMenu } from '@/hooks/use-popup-menu';
import { cn } from '@/lib/formatters/cn';
import { apiMutate } from '@/lib/http/api-client';

import { ThreadSwitcher } from '../_components/thread-switcher';

export type { AnalysisMode } from '@/lib/analysis-mode';

export interface ThreadSummary {
  id: string;
  title: string | null;
  pinnedSymbol: Symbol | null;
  updatedAt: number;
}

export interface ChatTopBarProps {
  threadId: string;
  title: string;
  pinnedSymbol: Symbol | null;
  threads: ThreadSummary[];
  isStreaming: boolean;
  splitMode?: boolean;
  onToggleSplitMode?: () => void;
}

function ThreadContext({
  title,
  pinnedSymbol,
  unpinning,
  onOpenDrawer,
  onClearPin,
  isStreaming,
}: {
  title: string;
  pinnedSymbol: Symbol | null;
  unpinning: boolean;
  onOpenDrawer: () => void;
  onClearPin: () => void;
  isStreaming: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <NavTrigger className="lg:hidden" />
      <KestrelBrand variant="mark" href="/dashboard" className="inline-flex lg:hidden" />

      <button
        type="button"
        onClick={onOpenDrawer}
        className="hover:bg-bg-elev-2 group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors"
        title="Switch conversation"
      >
        <h1 className="text-fg truncate text-sm font-semibold tracking-tight">{title}</h1>
        <IconHistory className="text-fg-subtle group-hover:text-fg size-3.5 shrink-0 transition-colors" />
      </button>

      {pinnedSymbol ? (
        <SymbolChip symbol={pinnedSymbol} clearing={unpinning} onClear={onClearPin} />
      ) : null}

      {isStreaming ? (
        <span className="text-brand bg-brand/10 border-brand/30 hidden items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-xs font-medium sm:inline-flex">
          <span className="bg-brand size-1.5 animate-pulse rounded-full" />
          Live
        </span>
      ) : null}
    </div>
  );
}

function ChatOverflowMenu({
  onSwitchConversation,
  onExport,
  onDelete,
}: {
  onSwitchConversation: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const overflowMenu = usePopupMenu();
  const items = [
    { icon: IconMessages, label: 'Switch conversation', onClick: onSwitchConversation },
    { icon: IconFileDownload, label: 'Export as Markdown', onClick: onExport },
    { icon: IconTrash, label: 'Delete conversation', onClick: onDelete, danger: true },
  ];

  return (
    <div className="relative" ref={overflowMenu.menuRef}>
      <button
        ref={overflowMenu.triggerRef}
        type="button"
        onClick={() => overflowMenu.setOpen((v) => !v)}
        aria-label="Conversation menu"
        {...overflowMenu.triggerProps}
        className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
      >
        <IconDots className="size-4" />
      </button>
      {overflowMenu.open ? (
        <div
          {...overflowMenu.menuProps}
          className="surface-elevated text-body-sm border-border absolute top-11 right-0 z-50 w-56 overflow-hidden rounded-lg border shadow-lg"
        >
          {items.map(({ icon: Icon, label, onClick, danger }, index) => (
            <div key={label}>
              {index > 0 ? <div className="border-border/60 border-t" /> : null}
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  overflowMenu.setOpen(false);
                  onClick();
                }}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium',
                  danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-bg-elev-2',
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatTopBar({
  threadId,
  title,
  pinnedSymbol,
  threads,
  isStreaming,
  splitMode = false,
  onToggleSplitMode,
}: ChatTopBarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [unpinning, setUnpinning] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  function newChat() {
    startTransition(async () => {
      try {
        const { thread } = await apiMutate<{ thread: { id: string } }>('/api/chat/threads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        router.refresh();
        router.push(`/chat/${thread.id}`);
      } catch (err) {
        toast.error('Failed to create chat', {
          description: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  async function deleteCurrent() {
    const ok = await confirm({
      title: 'Delete this conversation?',
      description: 'Messages in this conversation will be removed permanently.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await apiMutate(`/api/chat/threads/${threadId}`, { method: 'DELETE' });
        toast.success('Deleted');
        const next = threads.find((t) => t.id !== threadId);
        if (next) router.push(`/chat/${next.id}`);
        else router.push('/chat');
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  function exportThread() {
    const exportUrl = `/api/chat/threads/${threadId}/export`;
    const newWindow = window.open(exportUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      toast.error('Pop-up blocked. Click here to download', {
        duration: 8000,
        action: {
          label: 'Download',
          onClick: () => {
            window.location.href = exportUrl;
          },
        },
      });
    }
  }

  async function clearPin() {
    if (unpinning) return;
    setUnpinning(true);
    try {
      await apiMutate(`/api/chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinnedSymbol: null }),
      });
      toast.success('Pin cleared');
      router.refresh();
    } catch (err) {
      toast.error('Could not clear pin', {
        description: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      setUnpinning(false);
    }
  }

  return (
    <header className="border-border bg-bg/95 pt-safe sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top,0px))] min-h-12 w-full shrink-0 items-center justify-between gap-2 border-b px-3 backdrop-blur-md sm:px-4">
      <ThreadContext
        title={title}
        pinnedSymbol={pinnedSymbol}
        unpinning={unpinning}
        onOpenDrawer={() => setDrawerOpen(true)}
        onClearPin={() => void clearPin()}
        isStreaming={isStreaming}
      />

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip label="Open live chart" side="bottom">
          <Link
            href={`/chart/${pinnedSymbol ?? 'XAUUSD'}`}
            aria-label="Open live chart"
            className="tactile-press surface-chip text-fg-muted hover:text-fg hover:border-brand/40 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors lg:hidden"
          >
            <IconChartCandle className="size-4" strokeWidth={1.85} />
          </Link>
        </Tooltip>

        <Tooltip label="Open journal" side="bottom">
          <Link
            href="/journal"
            aria-label="Open journal"
            className="tactile-press surface-chip text-fg-muted hover:text-fg hover:border-brand/40 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors lg:hidden"
          >
            <IconNotebook className="size-4" strokeWidth={1.85} />
          </Link>
        </Tooltip>

        {onToggleSplitMode ? (
          <Tooltip
            label={
              splitMode
                ? 'Close chart & desk panel'
                : 'Open live chart, desk consensus & action plan'
            }
            side="bottom"
          >
            <button
              type="button"
              onClick={onToggleSplitMode}
              aria-label="Toggle views"
              aria-pressed={splitMode}
              className={cn(
                'tactile-press inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all sm:h-9 sm:min-w-0 sm:justify-start',
                splitMode
                  ? 'border-brand/50 bg-brand/12 text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_12px_rgba(255,54,22,0.16)]'
                  : 'surface-chip text-fg-muted hover:text-fg hover:border-white/15',
              )}
            >
              <IconLayoutSidebarRight className="size-4" strokeWidth={splitMode ? 2 : 1.75} />
              <span className="hidden sm:inline">Chart &amp; War Room</span>
            </button>
          </Tooltip>
        ) : null}

        <Tooltip label="New chat" side="bottom">
          <button
            type="button"
            onClick={newChat}
            disabled={pending}
            aria-label="New chat"
            className="tactile-press surface-chip text-fg-muted hover:text-fg hover:border-brand/40 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
          >
            {pending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconPlus className="size-4" strokeWidth={1.85} />
            )}
          </button>
        </Tooltip>

        <ChatOverflowMenu
          onSwitchConversation={() => setDrawerOpen(true)}
          onExport={exportThread}
          onDelete={() => void deleteCurrent()}
        />
      </div>

      <ThreadSwitcher
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        threadId={threadId}
        threads={threads}
        onPickNew={() => {
          setDrawerOpen(false);
          newChat();
        }}
      />

      {confirmEl}
    </header>
  );
}
