'use client';

// SPDX-License-Identifier: Apache-2.0

// Dual-stack War Room body: live chart on top, the active intelligence tab
// below, separated by a machined horizontal drag handle (35–65%, default 45%).
import type { Symbol, Timeframe } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { useCallback, useRef, useState } from 'react';

import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';

import type { ExtractedTradeLevels } from '../parts/syndicate-dossier/extract-trade-levels';
import { DockChartPanel } from './dock-chart-panel';
import { DockOpinionsPanel } from './dock-opinions-panel';
import { DockPlanPanel } from './dock-plan-panel';
import type { LatestPlan } from './use-latest-plan';

const MIN_SPLIT_RATIO = 35;
const MAX_SPLIT_RATIO = 65;
const DEFAULT_SPLIT_RATIO = 45;

interface DockSplitBodyProps {
  symbol: Symbol;
  activeTf: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  activeTab: 'chart' | 'opinions' | 'plan';
  latestPlan: LatestPlan;
  dossierSymbol: string;
  planId: string;
  levels: ExtractedTradeLevels;
  agentProgress?: AgentProgress | null;
  messages: UIMessage[];
}

export function DockSplitBody({
  symbol,
  activeTf,
  onTimeframeChange,
  splitRatio,
  onSplitRatioChange,
  activeTab,
  latestPlan,
  dossierSymbol,
  planId,
  levels,
  agentProgress,
  messages,
}: DockSplitBodyProps) {
  const [isRowResizing, setIsRowResizing] = useState(false);
  const rowDragRef = useRef<{ startY: number; startRatio: number; height: number } | null>(null);

  const startRowResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const height = event.currentTarget.parentElement?.getBoundingClientRect().height ?? 600;
      rowDragRef.current = { startY: event.clientY, startRatio: splitRatio, height };
      setIsRowResizing(true);
    },
    [splitRatio],
  );

  const moveRowResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!rowDragRef.current) return;
      const deltaPct =
        ((event.clientY - rowDragRef.current.startY) / rowDragRef.current.height) * 100;
      onSplitRatioChange(
        Math.max(
          MIN_SPLIT_RATIO,
          Math.min(MAX_SPLIT_RATIO, rowDragRef.current.startRatio + deltaPct),
        ),
      );
    },
    [onSplitRatioChange],
  );

  const endRowResize = useCallback(() => {
    rowDragRef.current = null;
    setIsRowResizing(false);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 shrink-0 overflow-hidden" style={{ height: `${splitRatio}%` }}>
        <DockChartPanel symbol={symbol} activeTf={activeTf} onTimeframeChange={onTimeframeChange} />
      </div>

      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize chart and intelligence panes"
        aria-valuemin={MIN_SPLIT_RATIO}
        aria-valuemax={MAX_SPLIT_RATIO}
        aria-valuenow={Math.round(splitRatio)}
        title="Drag to resize (double-click to reset)"
        onPointerDown={startRowResize}
        onPointerMove={moveRowResize}
        onPointerUp={endRowResize}
        onPointerCancel={endRowResize}
        onDoubleClick={() => onSplitRatioChange(DEFAULT_SPLIT_RATIO)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            onSplitRatioChange(Math.max(MIN_SPLIT_RATIO, splitRatio - 2));
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            onSplitRatioChange(Math.min(MAX_SPLIT_RATIO, splitRatio + 2));
          } else if (event.key === 'Home') {
            event.preventDefault();
            onSplitRatioChange(DEFAULT_SPLIT_RATIO);
          }
        }}
        className={cn(
          'group flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y border-white/[0.07] bg-[#101113] transition-colors',
          isRowResizing ? 'bg-brand/25' : 'hover:bg-brand/15',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-[2px] w-10 rounded-full transition-colors',
            isRowResizing ? 'bg-brand' : 'bg-white/15 group-hover:bg-brand/70',
          )}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'plan' ? (
          <DockPlanPanel
            latestPlan={latestPlan}
            symbol={dossierSymbol}
            planId={planId}
            levels={levels}
          />
        ) : (
          <DockOpinionsPanel agentProgress={agentProgress} messages={messages} />
        )}
      </div>
    </div>
  );
}
