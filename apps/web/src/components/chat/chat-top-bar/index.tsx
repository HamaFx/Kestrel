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
import { IconLayoutSidebarRight, IconLoader2, IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';
import { apiMutate } from '@/lib/http/api-client';

import { ThreadSwitcher } from '../_components/thread-switcher';
import { MODE_DESCRIPTIONS, MODE_LABELS, MODE_LABELS_COMPACT } from './mode-labels';
import { ChatOverflowMenu } from './overflow-menu';
import { ThreadContext } from './thread-context';
import type { ChatTopBarProps } from './types';

export type { AnalysisMode } from './mode-labels';
export { MODE_DESCRIPTIONS, MODE_LABELS, MODE_LABELS_COMPACT };
export type { ThreadSummary } from './types';

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
    <header
      className={cn(
        'sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top,0px))] min-h-12 w-full shrink-0 items-center justify-between gap-2',
        'border-border bg-bg pt-safe border-b px-3 sm:px-4',
      )}
    >
      {/* Left: Mobile Nav + Thread Title & Active Symbol */}
      <ThreadContext
        title={title}
        pinnedSymbol={pinnedSymbol}
        unpinning={unpinning}
        onOpenDrawer={() => setDrawerOpen(true)}
        onClearPin={() => void clearPin()}
        activeAgent={activeAgent}
        isStreaming={isStreaming}
      />

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
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
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
