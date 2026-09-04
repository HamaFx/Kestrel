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

import { UserPlanPartSchema, type Symbol, type Timeframe } from '@kestrel/shared';
import {
  IconChartCandle,
  IconCheck,
  IconListCheck,
  IconTerminal2,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';

import { TradingViewWidget } from '@/app/(app)/chart/[symbol]/_components/tradingview-widget';
import { Segmented } from '@/components/ui/segmented';
import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/cn';

import { AgentDeliberation } from './parts/agent-deliberation';
import { PlanPart } from './parts/plan';

export type DockTab = 'chart' | 'opinions' | 'plan' | 'terminal';

interface ThreadViewsDockProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: DockTab;
  onTabChange: (tab: DockTab) => void;
  symbol: Symbol;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  agentProgress?: AgentProgress | null;
  messages?: UIMessage[];
}

export function ThreadViewsDock({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  symbol,
  timeframe,
  onTimeframeChange,
  agentProgress,
  messages = [],
}: ThreadViewsDockProps) {
  // Extract latest plan part from messages if available
  const latestPlan = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg) continue;
      const rawPlan = (msg.parts ?? []).find(
        (p) =>
          p !== null && typeof p === 'object' && (p as { type?: string }).type === 'data-plan',
      );
      if (rawPlan) {
        const parsed = UserPlanPartSchema.safeParse(rawPlan);
        if (parsed.success) return parsed.data;
      }
    }
    return null;
  }, [messages]);

  const tabs: Array<{ id: DockTab; label: string; icon: typeof IconChartCandle; badge?: number }> = [
    { id: 'chart', label: 'Chart', icon: IconChartCandle },
    {
      id: 'opinions',
      label: 'Opinions',
      icon: IconUsers,
      badge: agentProgress?.agents ? Object.keys(agentProgress.agents).length : undefined,
    },
    { id: 'plan', label: 'Plan', icon: IconListCheck, badge: latestPlan?.steps.length },
    { id: 'terminal', label: 'Terminal', icon: IconTerminal2 },
  ];

  if (!isOpen) return null;

  return (
    <motion.aside
      key="thread-views-dock"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: '100%', opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      className="border-border/60 bg-bg/95 relative hidden h-full shrink-0 flex-col overflow-hidden border-l backdrop-blur-xl lg:flex lg:w-[420px] xl:w-[480px] 2xl:w-[540px]"
    >
      {/* Dock Header & Navigation Tabs */}
      <div className="border-border/40 bg-bg-elev-1 flex h-11 shrink-0 items-center justify-between border-b px-3">
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
                  'border-chip-edge relative flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-xs font-medium transition-all active:translate-y-[0.5px]',
                  isActive
                    ? 'border-brand/40 bg-brand/10 text-brand shadow-(--shadow-chip)'
                    : 'text-fg-muted hover:text-fg hover:bg-white/[0.04] border-transparent',
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="bg-brand/20 text-brand min-w-[16px] rounded-full px-1 text-[10px] font-mono leading-tight">
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
          className="text-fg-muted hover:text-fg hover:bg-white/[0.06] rounded-md p-1 transition-colors active:translate-y-[0.5px]"
        >
          <IconX className="size-4" />
        </button>
      </div>

      {/* Dock Content Body */}
      <div className="relative flex-1 overflow-hidden">
        {activeTab === 'chart' && (
          <div className="flex h-full flex-col">
            <div className="border-border/40 bg-bg-elev-1/60 flex items-center justify-between border-b px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-fg font-bold tracking-tight">{symbol}</span>
                <span className="text-fg-subtle text-caption">TradingView</span>
              </div>
              <Segmented
                size="sm"
                value={timeframe}
                options={[
                  { value: '5m', label: '5M' },
                  { value: '15m', label: '15M' },
                  { value: '1h', label: '1H' },
                  { value: '4h', label: '4H' },
                  { value: '1d', label: '1D' },
                ]}
                onChange={(tf) => onTimeframeChange(tf as Timeframe)}
              />
            </div>
            <div className="relative min-h-0 w-full flex-1">
              <TradingViewWidget symbol={symbol} tf={timeframe} theme="dark" />
            </div>
          </div>
        )}

        {activeTab === 'opinions' && (
          <div className="scrollbar-hide h-full overflow-y-auto p-4">
            {agentProgress ? (
              <AgentDeliberation
                agents={agentProgress.agents}
                mode={agentProgress.mode}
                status={agentProgress.status}
                error={agentProgress.error}
              />
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
                <IconUsers className="text-fg-subtle size-8 stroke-1" />
                <p className="text-fg-muted text-sm font-medium">Council Standby</p>
                <p className="text-fg-subtle max-w-xs text-xs">
                  Committee opinions from Technical, Macro, and Sentiment desks will stream here during analysis.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="scrollbar-hide h-full overflow-y-auto p-4">
            {latestPlan ? (
              <PlanPart plan={latestPlan} />
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
                <IconListCheck className="text-fg-subtle size-8 stroke-1" />
                <p className="text-fg-muted text-sm font-medium">No Active Plan</p>
                <p className="text-fg-subtle max-w-xs text-xs">
                  When Mastra workflows construct execution steps, DAG goals and milestones appear in this view.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="scrollbar-hide h-full overflow-y-auto p-4 font-mono text-xs">
            <div className="border-border/60 bg-black/40 rounded-lg border p-3">
              <div className="border-border/40 text-fg-subtle mb-2.5 flex items-center justify-between border-b pb-2 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span>KESTREL TELEMETRY STREAM</span>
                </span>
                <span>WS: CONNECTED</span>
              </div>
              <div className="space-y-1.5 text-fg-muted">
                <div className="flex items-center justify-between">
                  <span>feed.symbol:</span>
                  <span className="text-fg font-semibold">{symbol}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>feed.resolution:</span>
                  <span className="text-fg">{timeframe}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>feed.latency:</span>
                  <span className="text-emerald-400">~18ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>worker.state:</span>
                  <span className="text-fg">IDLE (Listening)</span>
                </div>
              </div>

              {agentProgress && (
                <div className="mt-3 border-t border-border/40 pt-2.5">
                  <span className="text-fg-subtle text-[10px] uppercase tracking-wider">Active Run</span>
                  <div className="mt-1 space-y-1 text-fg">
                    <p>mode: {agentProgress.mode}</p>
                    <p>status: {agentProgress.status}</p>
                    {agentProgress.error && (
                      <p className="text-rose-400">error: {agentProgress.error}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
