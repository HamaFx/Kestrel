'use client';

// SPDX-License-Identifier: Apache-2.0

// Left cluster of the top bar: thread title trigger, pinned symbol, active
// agent chip, and the streaming indicator.
import type { Symbol } from '@kestrel/shared';
import { IconHistory } from '@tabler/icons-react';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { NavTrigger } from '@/components/layout/nav-trigger';
import { SymbolChip } from '@/components/ui/symbol-chip';
import type { CustomAgentSummary } from '@/hooks/use-custom-agents';

interface ThreadContextProps {
  title: string;
  pinnedSymbol: Symbol | null;
  unpinning: boolean;
  onOpenDrawer: () => void;
  onClearPin: () => void;
  activeAgent: CustomAgentSummary | null;
  isStreaming: boolean;
}

export function ThreadContext({
  title,
  pinnedSymbol,
  unpinning,
  onOpenDrawer,
  onClearPin,
  activeAgent,
  isStreaming,
}: ThreadContextProps) {
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
  );
}
