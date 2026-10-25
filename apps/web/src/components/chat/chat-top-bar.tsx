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
  IconDots,
  IconFileDownload,
  IconHistory,
  IconLayoutSidebarRight,
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
import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import { usePopupMenu } from '@/hooks/use-popup-menu';
import type { AnalysisMode } from '@/lib/analysis-mode';
import { apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';

import { ThreadSwitcher } from './_components/thread-switcher';

export type { AnalysisMode } from '@/lib/analysis-mode';

export const MODE_LABELS: Record<AnalysisMode, string> = {
  single: 'Quick Read',
  full: 'Full Committee',
};

export const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  single: 'Single-desk analysis — one technical desk. Use Full for the 4-desk committee.',
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
  /** Active standalone agent, when the composer has one selected. */
  activeAgent?: CustomAgentSummary | null;
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
  activeAgent = null,
}: ChatTopBarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [unpinning, setUnpinning] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const overflowMenu = usePopupMenu();
  const isSidecarOpen = viewsOpen || splitMode;

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
        'sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top,0px))] min-h-12 w-full shrink-0 items-center justify-between gap-2',
        'border-border bg-bg pt-safe border-b px-3 sm:px-4',
      )}
    >
      {/* Left: Mobile Nav + Thread Title & Active Symbol */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <NavTrigger className="lg:hidden" />
        <KestrelBrand variant="mark" href="/dashboard" className="inline-flex lg:hidden" />

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="hover:bg-bg-elev-2 group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors"
          title="Switch conversation"
        >
          <h1 className="text-fg truncate text-sm font-semibold tracking-tight">{title}</h1>
          <IconHistory className="text-fg-subtle group-hover:text-fg size-3.5 shrink-0 transition-colors" />
        </button>

        {pinnedSymbol ? (
          <SymbolChip symbol={pinnedSymbol} clearing={unpinning} onClear={() => void clearPin()} />
        ) : null}

        {activeAgent ? (
          <span
            className="border-brand/30 bg-brand/10 text-brand hidden items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold sm:inline-flex"
            title={`Standalone agent: ${activeAgent.name}`}
          >
            @{activeAgent.slug}
          </span>
        ) : null}

        {isStreaming ? (
          <span className="text-brand bg-brand/10 border-brand/30 hidden items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-xs font-medium sm:inline-flex">
            <span className="bg-brand size-1.5 animate-pulse rounded-full" />
            Live
          </span>
        ) : null}
      </div>

      {/* Right: Workspace Sidecar Toggle + New Chat + Overflow Menu */}
      <div className="flex shrink-0 items-center gap-1.5">
        {(onToggleViews || onToggleSplitMode) && (
          <Tooltip
            label={
              isSidecarOpen
                ? 'Close chart & desk panel'
                : 'Open live chart, desk consensus & action plan'
            }
            side="bottom"
          >
            <button
              type="button"
              onClick={onToggleViews ?? onToggleSplitMode}
              aria-label="Toggle views"
              aria-pressed={isSidecarOpen}
              className={cn(
                'hidden h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors lg:inline-flex',
                isSidecarOpen
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-border bg-bg-elev-1 text-fg-muted hover:text-fg hover:bg-bg-elev-2',
              )}
            >
              <IconLayoutSidebarRight className="size-4" />
              <span>Chart & Desks</span>
            </button>
          </Tooltip>
        )}

        <Tooltip label="New chat" side="bottom">
          <button
            type="button"
            onClick={newChat}
            disabled={pending}
            aria-label="New chat"
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors disabled:opacity-50"
          >
            {pending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconPlus className="size-4" />
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
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
          >
            <IconDots className="size-4" />
          </button>
          {overflowMenu.open ? (
            <div
              {...overflowMenu.menuProps}
              className="surface-elevated text-body-sm border-border absolute top-11 right-0 z-50 w-56 overflow-hidden rounded-lg border shadow-lg"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  overflowMenu.setOpen(false);
                  setDrawerOpen(true);
                }}
                className="text-fg hover:bg-bg-elev-2 flex min-h-[44px] w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium"
              >
                <IconMessages className="size-4" />
                Switch conversation
              </button>
              <div className="border-border/60 border-t" />
              <button
                role="menuitem"
                type="button"
                onClick={exportThread}
                className="text-fg hover:bg-bg-elev-2 flex min-h-[44px] w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium"
              >
                <IconFileDownload className="size-4" />
                Export as Markdown
              </button>
              <div className="border-border/60 border-t" />
              <button
                role="menuitem"
                type="button"
                onClick={() => void deleteCurrent()}
                className="text-danger hover:bg-danger/10 flex min-h-[44px] w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium"
              >
                <IconTrash className="size-4" />
                Delete conversation
              </button>
            </div>
          ) : null}
        </div>
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
