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

import type { Symbol } from '@kestrel/shared';
import {
  IconBolt,
  IconDotsCircleHorizontal,
  IconFileDownload,
  IconLoader2,
  IconMessages,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { NavTrigger } from '@/components/layout/nav-trigger';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { SymbolChip } from '@/components/ui/symbol-chip';
import { Tooltip } from '@/components/ui/tooltip';
import { usePopupMenu } from '@/hooks/use-popup-menu';
import { apiMutate } from '@/lib/api-client';
import type { AnalysisMode } from '@/lib/analysis-mode';
import { cn } from '@/lib/cn';

import { ThreadSwitcher } from './_components/thread-switcher';

// Re-exported for client components that already import the type from here.
export type { AnalysisMode } from '@/lib/analysis-mode';

export const MODE_LABELS: Record<AnalysisMode, string> = {
  single: 'Quick Read',
  full: 'Full Committee',
};

export const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  single: 'Fast 1-desk technical check (~5s)',
  full: 'All 4 specialist desks + trade plan',
};

export interface ThreadSummary {
  id: string;
  title: string | null;
  pinnedSymbol: Symbol | null;
  updatedAt: number;
}

interface ChatTopBarProps {
  threadId: string;
  title: string;
  pinnedSymbol: Symbol | null;
  threads: ThreadSummary[];
  isStreaming: boolean;
  analysisMode?: AnalysisMode;
  onAnalysisModeChange?: (mode: AnalysisMode) => void;
  chatModel?: string | null;
  onChatModelChange?: (modelId: string) => void;
  modelSelectionPending?: boolean;
  splitMode?: boolean;
  onToggleSplitMode?: () => void;
  viewsOpen?: boolean;
  onToggleViews?: () => void;
}

export function ChatTopBar({
  threadId,
  title,
  pinnedSymbol,
  threads,
  isStreaming,
  splitMode = false,
  onToggleSplitMode,
  viewsOpen = false,
  onToggleViews,
}: ChatTopBarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [unpinning, setUnpinning] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const overflowMenu = usePopupMenu();

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
    overflowMenu.setOpen(false);
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
    overflowMenu.setOpen(false);
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
    <header
      className={cn(
        'sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top,0px))] min-h-12 w-full shrink-0 items-center justify-between',
        'border-border bg-bg/90 pt-safe border-b px-3 backdrop-blur-md',
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <NavTrigger className="lg:hidden" />
        <KestrelBrand variant="mark" href="/dashboard" className="inline-flex lg:hidden" />
      </div>

      {/* Center: title + pinned symbol */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
        <h1 className="text-fg truncate text-sm font-semibold tracking-tight">{title}</h1>
        {pinnedSymbol ? (
          <SymbolChip symbol={pinnedSymbol} clearing={unpinning} onClear={() => void clearPin()} />
        ) : null}
        {isStreaming ? (
          <span className="text-fg-subtle text-caption inline-flex items-center gap-1 font-medium">
            <IconBolt className="size-2.5 animate-pulse" /> analyzing market…
          </span>
        ) : null}
      </div>

      {/* Views Sidecar Trigger */}
      {(onToggleViews || onToggleSplitMode) && (
        <Tooltip
          label={
            viewsOpen || splitMode
              ? 'Close side panel'
              : 'Open side panel (Live Chart, Desk Opinions & Action Plan)'
          }
          side="bottom"
        >
          <button
            type="button"
            onClick={onToggleViews ?? onToggleSplitMode}
            aria-label="Toggle views"
            className={cn(
              'border-chip-edge text-caption relative hidden shrink-0 items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 font-mono font-medium transition-all active:translate-y-[0.5px] lg:inline-flex',
              viewsOpen || splitMode
                ? 'border-brand/40 bg-brand/10 text-brand shadow-(--shadow-chip)'
                : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
            )}
          >
            <span className="text-fg-subtle text-[11px] font-mono">
              [{viewsOpen || splitMode ? '•' : ' '}]
            </span>
            <span>Views</span>
          </button>
        </Tooltip>
      )}

      <Tooltip label="New chat" side="bottom">
        <button
          type="button"
          onClick={newChat}
          disabled={pending}
          aria-label="New chat"
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-colors disabled:opacity-50"
        >
          {pending ? (
            <IconLoader2 className="size-5 animate-spin" />
          ) : (
            <IconPlus className="size-5" />
          )}
        </button>
      </Tooltip>

      <div className="relative" ref={overflowMenu.menuRef}>
        <button
          ref={overflowMenu.triggerRef}
          type="button"
          onClick={() => overflowMenu.setOpen((v) => !v)}
          aria-label="Conversation menu"
          {...overflowMenu.triggerProps}
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-colors"
        >
          <IconDotsCircleHorizontal className="size-5" />
        </button>
        {overflowMenu.open ? (
          <div
            {...overflowMenu.menuProps}
            className="surface-elevated text-body-sm absolute top-12 right-0 z-50 w-56 overflow-hidden rounded-sm"
          >
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                overflowMenu.setOpen(false);
                setDrawerOpen(true);
              }}
              className="text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
            >
              <IconMessages className="size-4" />
              Switch conversation
            </button>
            <div className="border-border/60 border-t" />
            <button
              role="menuitem"
              type="button"
              onClick={exportThread}
              className="text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
            >
              <IconFileDownload className="size-4" />
              Export as Markdown
            </button>
            <div className="border-border/60 border-t" />
            <button
              role="menuitem"
              type="button"
              onClick={() => void deleteCurrent()}
              className="text-danger hover:bg-danger/10 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
            >
              <IconTrash className="size-4" />
              Delete conversation
            </button>
          </div>
        ) : null}
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
