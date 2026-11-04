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

// SPDX-License-Identifier: Apache-2.0
import {
  IconArrowRight,
  IconBuildingBank,
  IconChartCandle,
  IconCpu,
  IconRadar,
  IconScale,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { getSessionInfo } from '@/lib/auth/session';
import { cn } from '@/lib/formatters/cn';
import { FOUR_SPECIALIST_DESKS, type CanonicalDeskId } from '@/lib/kestrel-strategist-desks';

const QUICK_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'USDJPY'] as const;

const DESK_BADGE_CLASSES: Record<CanonicalDeskId, string> = {
  fundamental: 'text-info border-info/30 bg-info/10',
  technical: 'text-bull border-bull/30 bg-bull/10',
  risk: 'text-warn border-warn/30 bg-warn/10',
  sentiment: 'text-brand border-brand/30 bg-brand/10',
};

interface DeskBrief {
  id: string;
  deskId: CanonicalDeskId;
  deskLabel: string;
  title: string;
  detail: string;
  prompt: string;
}

function buildDeskBriefs(symbol: string, sessionLabel: string): readonly DeskBrief[] {
  return [
    {
      id: 'f1',
      deskId: 'fundamental',
      deskLabel: 'Macro',
      title: `${sessionLabel} macro catalysts for ${symbol}`,
      detail: 'Upcoming high-impact releases and central bank rate expectations',
      prompt: `What are the key economic calendar catalysts and central bank drivers for ${symbol} this session?`,
    },
    {
      id: 'f2',
      deskId: 'fundamental',
      deskLabel: 'Macro',
      title: `US 10Y real yields & DXY vs ${symbol}`,
      detail: 'Cross-asset rate divergence and dollar index pressure',
      prompt: `Analyze US 10-year real yields and DXY correlation against ${symbol} right now.`,
    },
    {
      id: 't1',
      deskId: 'technical',
      deskLabel: 'Technical',
      title: `${symbol} 4H → 15m structure & key levels`,
      detail: 'Swing highs/lows, PDH/PDL, and EMA20/50/200 alignment',
      prompt: `Run a top-down 4H to 15m technical structure and key level analysis on ${symbol}.`,
    },
    {
      id: 't2',
      deskId: 'technical',
      deskLabel: 'Technical',
      title: `${symbol} momentum & session levels`,
      detail: 'RSI-14 regime, MACD histogram, and Asian/London/NY range highs & lows',
      prompt: `Map RSI-14, MACD and session level confluence on ${symbol}.`,
    },
    {
      id: 'r1',
      deskId: 'risk',
      deskLabel: 'Risk',
      title: `${symbol} 1% position size & ATR invalidation`,
      detail: 'Volatility-adjusted stop placement and 1:2.5+ target structure',
      prompt: `Calculate 1% risk position sizing, ATR stop loss distance, and invalidation level for ${symbol}.`,
    },
    {
      id: 'r2',
      deskId: 'risk',
      deskLabel: 'Risk',
      title: 'Scenario stress test & key breach levels',
      detail: 'Bull/bear invalidation triggers and maximum drawdown guardrails',
      prompt: `What price level invalidates the current ${symbol} thesis, and where should risk alerts sit?`,
    },
    {
      id: 's1',
      deskId: 'sentiment',
      deskLabel: 'Sentiment',
      title: `${symbol} CFTC COT institutional positioning`,
      detail: 'Non-commercial speculator net flow vs commercial hedgers',
      prompt: `Check CFTC Commitments of Traders (COT) institutional positioning and net flow for ${symbol}.`,
    },
    {
      id: 's2',
      deskId: 'sentiment',
      deskLabel: 'Sentiment',
      title: 'Crowd skew & contrarian exhaustion check',
      detail: 'Retail positioning extremes and smart-money divergence',
      prompt: `Analyze retail sentiment skew and institutional order flow divergence on ${symbol}.`,
    },
  ];
}

function DeskIcon({ deskId }: { deskId: CanonicalDeskId }) {
  switch (deskId) {
    case 'technical':
      return (
        <span className="icon-housing-bull size-8 shrink-0 rounded-lg">
          <IconChartCandle className="size-4" strokeWidth={1.85} />
        </span>
      );
    case 'fundamental':
      return (
        <span className="icon-housing-info size-8 shrink-0 rounded-lg">
          <IconBuildingBank className="size-4" strokeWidth={1.85} />
        </span>
      );
    case 'risk':
      return (
        <span className="icon-housing-warn size-8 shrink-0 rounded-lg">
          <IconScale className="size-4" strokeWidth={1.85} />
        </span>
      );
    default:
      return (
        <span className="icon-housing-brand size-8 shrink-0 rounded-lg">
          <IconRadar className="size-4" strokeWidth={1.85} />
        </span>
      );
  }
}

export function QuantDeskWidget() {
  const router = useRouter();
  const [activeDesk, setActiveDesk] = useState<'all' | CanonicalDeskId>('all');
  const [activeSymbol, setActiveSymbol] = useState<string>('XAUUSD');

  // The session label is derived from the current time, which must not be read
  // during the first render: the server and the browser would disagree across
  // a session boundary. It settles immediately after mount.
  const [sessionLabel, setSessionLabel] = useState('Session');
  useEffect(() => {
    setSessionLabel(getSessionInfo(new Date()).label);
  }, []);

  const allBriefs = useMemo(
    () => buildDeskBriefs(activeSymbol, sessionLabel),
    [activeSymbol, sessionLabel],
  );
  const visibleBriefs = useMemo(() => {
    if (activeDesk === 'all') {
      return FOUR_SPECIALIST_DESKS.map((d) => {
        const id = d.id as CanonicalDeskId;
        return allBriefs.find((b) => b.deskId === id)!;
      });
    }
    return allBriefs.filter((b) => b.deskId === activeDesk);
  }, [activeDesk, allBriefs]);

  const handleLaunchSpecialist = (prompt: string) => {
    router.push(`/chat?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <Card as="section" aria-label="Trading Floor Specialists" className="flex flex-col gap-3">
      <header className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2">
          <IconCpu className="text-brand size-4" />
          <h3 className="text-fg text-sm font-semibold">4-Desk Specialist Launcher</h3>
          <span className="text-fg-subtle font-mono text-[11px] tabular-nums">
            · {sessionLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="surface-well flex items-center gap-0.5 rounded-lg p-0.5">
            {QUICK_SYMBOLS.map((sym) => {
              const isSelected = activeSymbol === sym;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setActiveSymbol(sym)}
                  className={cn(
                    'tactile-press rounded-md px-2 py-1 font-mono text-[11px] font-medium transition-colors',
                    isSelected
                      ? 'surface-chip bg-bg-elev-2 text-brand font-semibold'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  {sym}
                </button>
              );
            })}
          </div>

          <Link
            href="/chat"
            className="text-fg-subtle hover:text-brand inline-flex min-h-[28px] items-center gap-1 font-mono text-xs font-semibold transition-colors"
          >
            <span className="hidden sm:inline">Council</span>
            <IconArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FOUR_SPECIALIST_DESKS.map((desk) => {
          const deskId = desk.id as CanonicalDeskId;
          const isSelected = activeDesk === deskId;
          return (
            <button
              key={deskId}
              type="button"
              onClick={() => setActiveDesk(isSelected ? 'all' : deskId)}
              aria-pressed={isSelected}
              className={cn(
                'tactile-press flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all',
                isSelected
                  ? 'surface-chip border-brand/40 bg-brand/[0.06]'
                  : 'surface-well hover:border-border border-white/5',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <DeskIcon deskId={deskId} />
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase',
                    isSelected
                      ? DESK_BADGE_CLASSES[deskId]
                      : 'border-border/60 bg-bg-elev-2 text-fg-subtle',
                  )}
                >
                  {desk.chipLabel}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-fg text-xs font-semibold">
                  {desk.title.replace(/ Desk$/, '')}
                </span>
                <span className="text-fg-subtle line-clamp-1 text-xs">{desk.domainMetrics}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleBriefs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleLaunchSpecialist(item.prompt)}
            className="surface-chip hover:border-brand/40 tactile-press flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg text-xs font-semibold">{item.title}</span>
              <span className="text-brand font-mono text-[10px] uppercase">{item.deskLabel}</span>
            </div>
            <span className="text-fg-muted line-clamp-1 text-xs">{item.detail}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
