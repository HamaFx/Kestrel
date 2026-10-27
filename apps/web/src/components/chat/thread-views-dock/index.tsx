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
// and context panels. Each panel is its own component.
import type { Symbol, Timeframe } from '@kestrel/shared';
import { IconChartCandle, IconListCheck, IconUsers, IconX } from '@tabler/icons-react';
import type { UIMessage } from 'ai';
import { m } from 'motion/react';
import { useEffect, useState } from 'react';

import { useTimeframe } from '@/hooks/use-tf';
import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';

import { DockChartPanel } from './dock-chart-panel';
import { DockOpinionsPanel } from './dock-opinions-panel';
import { DockPlanPanel } from './dock-plan-panel';
import { useLatestPlan } from './use-latest-plan';
import { useLatestSyndicateMeta } from './use-latest-syndicate-meta';

export type DockTab = 'chart' | 'opinions' | 'plan';

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

  const isDesktop = useIsDesktop();

  // Mobile sheet: Escape dismisses the slide-over, matching the backdrop tap.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const tabs: Array<{ id: DockTab; label: string; icon: typeof IconChartCandle; badge?: number }> =
    [
      { id: 'chart', label: 'Chart', icon: IconChartCandle },
      { id: 'opinions', label: 'Council', icon: IconUsers, badge: councilBadge },
      { id: 'plan', label: 'Plan', icon: IconListCheck, badge: latestPlan?.steps.length },
    ];

  if (!isOpen) return null;

  // Desktop: the dock pushes the thread pane (width tween). Below lg it is a
  // fixed slide-over, so it slides in from the right edge instead.
  const motionProps = isDesktop
    ? {
        initial: { width: 0, opacity: 0 },
        animate: { width: '100%', opacity: 1 },
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
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        className="border-border/40 bg-bg-elev-1 fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-md shrink-0 flex-col overflow-hidden border-l shadow-[0_0_50px_rgba(0,0,0,0.6)] lg:static lg:z-auto lg:w-[420px] lg:max-w-none lg:shadow-none xl:w-[480px] 2xl:w-[540px]"
      >
        {/* Dock Header & Navigation Tabs */}
        <div className="border-border/40 bg-bg-elev-2/80 relative flex h-12 shrink-0 items-center justify-between overflow-hidden border-b px-3">
          <span
            aria-hidden="true"
            className="font-bebas text-fg pointer-events-none absolute inset-x-0 top-1/2 -z-0 -translate-y-1/2 text-center text-2xl tracking-[0.22em] opacity-[0.03] select-none"
          >
            KESTREL // SOVEREIGN COUNCIL
          </span>
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

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Views"
            className="text-fg-subtle hover:bg-bg-elev-3 hover:text-fg relative z-10 rounded-lg p-1.5 transition-colors"
          >
            <IconX className="size-4" />
          </button>
        </div>

        {/* Dock Content Body */}
        <div className="relative flex-1 overflow-hidden">
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

          {activeTab === 'plan' && <DockPlanPanel latestPlan={latestPlan} />}
        </div>
      </m.aside>
    </>
  );
}
