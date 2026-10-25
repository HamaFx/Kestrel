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
import {
  IconChartCandle,
  IconListCheck,
  IconTerminal2,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import type { UIMessage } from 'ai';
import { m } from 'motion/react';

import { useTimeframe } from '@/hooks/use-tf';
import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';

import { DockChartPanel } from './dock-chart-panel';
import { DockContextPanel } from './dock-context-panel';
import { DockOpinionsPanel } from './dock-opinions-panel';
import { DockPlanPanel } from './dock-plan-panel';
import { useLatestPlan } from './use-latest-plan';

export type DockTab = 'chart' | 'opinions' | 'plan' | 'terminal';

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

  const tabs: Array<{ id: DockTab; label: string; icon: typeof IconChartCandle; badge?: number }> =
    [
      { id: 'chart', label: 'Chart', icon: IconChartCandle },
      {
        id: 'opinions',
        label: '4-Desk',
        icon: IconUsers,
        badge: Array.isArray(agentProgress?.agents) ? agentProgress.agents.length : undefined,
      },
      { id: 'plan', label: 'Plan', icon: IconListCheck, badge: latestPlan?.steps.length },
      { id: 'terminal', label: 'Context', icon: IconTerminal2 },
    ];

  if (!isOpen) return null;

  return (
    <m.aside
      key="thread-views-dock"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: '100%', opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
      className="border-border bg-bg relative hidden h-full shrink-0 flex-col overflow-hidden border-l lg:flex lg:w-[420px] xl:w-[480px] 2xl:w-[540px]"
    >
      {/* Dock Header & Navigation Tabs */}
      <div className="border-border bg-bg-elev-1 flex h-12 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2 border-transparent',
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="bg-brand/20 text-brand min-w-[16px] rounded-full px-1 font-mono text-xs leading-tight tabular-nums">
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
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 rounded-lg p-1.5 transition-colors"
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

        {activeTab === 'opinions' && <DockOpinionsPanel agentProgress={agentProgress} />}

        {activeTab === 'plan' && <DockPlanPanel latestPlan={latestPlan} />}

        {activeTab === 'terminal' && (
          <DockContextPanel symbol={symbol} activeTf={activeTf} agentProgress={agentProgress} />
        )}
      </div>
    </m.aside>
  );
}
