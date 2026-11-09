// SPDX-License-Identifier: Apache-2.0

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

// Right-hand views dock shell: tab navigation over the chart, 4-desk, plan,
// and context panels. Features a desktop drag-resize divider with persisted
// width (`kestrel:war-room-width:v1`) and keyboard arrow accessibility.
import type { Symbol, Timeframe } from '@kestrel/shared';
import { IconChartCandle, IconColumns, IconListCheck, IconUsers, IconX } from '@tabler/icons-react';
import type { UIMessage } from 'ai';
import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTimeframe } from '@/hooks/use-tf';
import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';

import { DockChartPanel } from './dock-chart-panel';
import { DockOpinionsPanel } from './dock-opinions-panel';
import { DockSplitBody } from './dock-split-body';
import { DockPlanPanel } from './dock-plan-panel';
import { useDockDossier } from './use-dock-dossier';
import { useLatestPlan } from './use-latest-plan';
import { useLatestSyndicateMeta } from './use-latest-syndicate-meta';

export type DockTab = 'chart' | 'opinions' | 'plan';

const DOCK_WIDTH_STORAGE_KEY = 'kestrel:war-room-width:v1';
const SPLIT_STORAGE_KEY = 'kestrel:war-room-split-stack:v1';
const DEFAULT_DOCK_WIDTH = 480;
const MIN_DOCK_WIDTH = 360;
const MAX_DOCK_WIDTH = 760;
const DEFAULT_SPLIT_RATIO = 45;

function clampDockWidth(width: number): number {
  return Math.max(MIN_DOCK_WIDTH, Math.min(MAX_DOCK_WIDTH, Math.round(width)));
}

/**
 * Track the `lg` breakpoint so the dock behaves as a docked sidecar on
 * desktop and as a right-hand slide-over on smaller screens.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(query.matches);
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

interface ThreadViewsDockProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: DockTab;
  onTabChange: (tab: DockTab) => void;
  symbol: Symbol;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  agentProgress?: AgentProgress | null;
  messages?: UIMessage[];
}

export function ThreadViewsDock({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  symbol,
  timeframe: propTimeframe,
  onTimeframeChange,
  agentProgress,
  messages = [],
}: ThreadViewsDockProps) {
  const [urlTf, setUrlTf] = useTimeframe();
  const activeTf = propTimeframe ?? urlTf ?? '15m';

  const handleTimeframeChange = (nextTf: Timeframe) => {
    setUrlTf(nextTf);
    onTimeframeChange?.(nextTf);
  };
  const latestPlan = useLatestPlan(messages);
  const latestSyndicate = useLatestSyndicateMeta(messages, agentProgress);
  const councilBadge = Array.isArray(latestSyndicate?.agents)
    ? latestSyndicate?.agents.length
    : undefined;
  const dossier = useDockDossier(messages, latestSyndicate, symbol);

  const isDesktop = useIsDesktop();
  const [dockWidth, setDockWidth] = useState<number>(DEFAULT_DOCK_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DOCK_WIDTH_STORAGE_KEY);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          setDockWidth(clampDockWidth(parsed));
        }
      }
    } catch {
      // Ignore storage access errors in restricted privacy contexts
    }
  }, []);

  const persistWidth = useCallback((nextWidth: number) => {
    const clamped = clampDockWidth(nextWidth);
    setDockWidth(clamped);
    try {
      window.localStorage.setItem(DOCK_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDesktop) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStartRef.current = { startX: event.clientX, startWidth: dockWidth };
      setIsResizing(true);
    },
    [dockWidth, isDesktop],
  );

  const moveResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const delta = dragStartRef.current.startX - event.clientX;
    setDockWidth(clampDockWidth(dragStartRef.current.startWidth + delta));
  }, []);

  const endResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;
      const delta = dragStartRef.current.startX - event.clientX;
      const finalWidth = clampDockWidth(dragStartRef.current.startWidth + delta);
      dragStartRef.current = null;
      setIsResizing(false);
      persistWidth(finalWidth);
    },
    [persistWidth],
  );

  const [splitStack, setSplitStack] = useState(false);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SPLIT_STORAGE_KEY);
      if (saved !== null) {
        setSplitStack(saved === 'true');
      } else {
        setSplitStack(window.innerHeight >= 760);
      }
    } catch {
      // Ignore storage access errors in restricted privacy contexts
    }
  }, []);

  const toggleSplitStack = useCallback(() => {
    const next = !splitStack;
    setSplitStack(next);
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage write errors
    }
    if (next && activeTab === 'chart') onTabChange('opinions');
  }, [activeTab, onTabChange, splitStack]);

  // Mobile sheet: Escape dismisses the slide-over, matching the backdrop tap.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const stacked = splitStack && isDesktop;
  const tabs: Array<{ id: DockTab; label: string; icon: typeof IconChartCandle; badge?: number }> =
    [
      ...(stacked ? [] : [{ id: 'chart' as const, label: 'Chart', icon: IconChartCandle }]),
      { id: 'opinions', label: 'Analysis', icon: IconUsers, badge: councilBadge },
      { id: 'plan', label: 'Plan', icon: IconListCheck, badge: latestPlan?.steps.length },
    ];

  if (!isOpen) return null;

  // Desktop: the dock pushes the thread pane (width tween). Below lg it is a
  // fixed slide-over, so it slides in from the right edge instead.
  const motionProps = isDesktop
    ? {
        initial: { width: 0, opacity: 0 },
        animate: { width: dockWidth, opacity: 1 },
        exit: { width: 0, opacity: 0 },
      }
    : {
        initial: { x: '100%', opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: '100%', opacity: 0 },
      };

  return (
    <>
      {/* Mobile slide-over scrim: tap-away closes the sheet. Hidden on the
          docked desktop layout where the aside pushes the thread pane. */}
      <m.button
        key="thread-views-dock-scrim"
        type="button"
        aria-label="Close views backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default bg-black/60 backdrop-blur-xs lg:hidden"
      />
      <m.aside
        key="thread-views-dock"
        {...motionProps}
        transition={isResizing ? { duration: 0 } : { duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        style={isDesktop ? { width: dockWidth } : undefined}
        className="border-border/40 bg-bg-elev-1 fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-md shrink-0 flex-col overflow-hidden border-l shadow-[0_0_50px_rgba(0,0,0,0.6)] lg:relative lg:z-auto lg:max-w-none lg:shadow-none"
      >
        {/* Machined Desktop Resize Handle (left edge) */}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize War Room dock"
          aria-valuemin={MIN_DOCK_WIDTH}
          aria-valuemax={MAX_DOCK_WIDTH}
          aria-valuenow={dockWidth}
          title="Drag to resize War Room (double-click to reset)"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={() => persistWidth(DEFAULT_DOCK_WIDTH)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              persistWidth(dockWidth + 24);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              persistWidth(dockWidth - 24);
            } else if (e.key === 'Home') {
              e.preventDefault();
              persistWidth(DEFAULT_DOCK_WIDTH);
            }
          }}
          className={cn(
            'group absolute inset-y-0 left-0 z-30 hidden w-2 cursor-col-resize items-center justify-center transition-colors lg:flex',
            isResizing ? 'bg-brand/25' : 'hover:bg-brand/15',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-10 w-[2px] rounded-full transition-colors',
              isResizing ? 'bg-brand' : 'bg-white/15 group-hover:bg-brand/70',
            )}
          />
        </div>

        {/* Dock Header & Navigation Tabs */}
        <div className="border-border/40 bg-bg-elev-2/80 relative flex h-12 shrink-0 items-center justify-between overflow-hidden border-b px-3">
          <div className="relative z-10 flex items-center gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'relative flex min-h-11 items-center gap-1.5 rounded-md px-2.5 font-mono text-[11px] font-semibold tracking-wider uppercase transition-all sm:min-h-9',
                    isActive
                      ? 'bg-bg-elev-3 text-brand after:bg-brand shadow-xs after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4/5 after:-translate-x-1/2'
                      : 'text-fg-muted hover:bg-bg-elev-3/50 hover:text-fg',
                  )}
                >
                  <Icon className={cn('size-3.5', isActive ? 'text-brand' : 'text-fg-subtle')} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="bg-brand/20 text-brand min-w-[16px] rounded-full px-1 font-mono text-[10px] leading-tight font-bold tabular-nums">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative z-10 flex items-center gap-0.5">
            <button
              type="button"
              onClick={toggleSplitStack}
              aria-pressed={stacked}
              title={stacked ? 'Single tab view' : 'Split chart + intelligence'}
              aria-label={stacked ? 'Switch to single tab view' : 'Split chart and intelligence'}
              className={cn(
                'hidden min-h-9 items-center gap-1 rounded-md border px-2 font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors lg:inline-flex',
                stacked
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'text-fg-subtle border-white/[0.08] hover:text-fg',
              )}
            >
              <IconColumns className="size-3.5" />
              <span className="hidden xl:inline">Split</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Views"
              className="text-fg-subtle hover:bg-bg-elev-3 hover:text-fg rounded-lg p-1.5 transition-colors"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>

        {/* Dock Content Body */}
        <div className="relative flex-1 overflow-hidden">
          {stacked ? (
            <DockSplitBody
              symbol={symbol}
              activeTf={activeTf}
              onTimeframeChange={handleTimeframeChange}
              splitRatio={splitRatio}
              onSplitRatioChange={setSplitRatio}
              activeTab={activeTab}
              latestPlan={latestPlan}
              dossierSymbol={dossier.symbol}
              planId={dossier.planId}
              levels={dossier.levels}
              agentProgress={agentProgress}
              messages={messages}
            />
          ) : (
            <>
              {activeTab === 'chart' && (
                <DockChartPanel
                  symbol={symbol}
                  activeTf={activeTf}
                  onTimeframeChange={handleTimeframeChange}
                />
              )}

              {activeTab === 'opinions' && (
                <DockOpinionsPanel agentProgress={agentProgress} messages={messages} />
              )}

              {activeTab === 'plan' && (
                <DockPlanPanel
                  latestPlan={latestPlan}
                  symbol={dossier.symbol}
                  planId={dossier.planId}
                  levels={dossier.levels}
                />
              )}
            </>
          )}
        </div>
      </m.aside>
    </>
  );
}
