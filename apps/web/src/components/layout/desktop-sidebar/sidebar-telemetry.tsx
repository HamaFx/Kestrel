'use client';

// SPDX-License-Identifier: Apache-2.0

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

// <SidebarTelemetry> — Live Market Session & XAU/USD Benchmark mini-HUD
// docked in the sidebar cockpit. Displays real-time market state, London/NY
// active sessions, and live gold price.

import { IconChartCandle, IconClock } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useEffect, useRef, useState } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { usePrice } from '@/hooks/use-prices';
import { cn } from '@/lib/formatters/cn';

function getCurrentSession(utcHour: number): { name: string; isKillzone: boolean } {
  if (utcHour >= 12 && utcHour < 16) {
    return { name: 'NY // LON OVERLAP', isKillzone: true };
  }
  if (utcHour >= 12 && utcHour < 21) {
    return { name: 'NEW YORK OPEN', isKillzone: false };
  }
  if (utcHour >= 7 && utcHour < 16) {
    return { name: 'LONDON OPEN', isKillzone: false };
  }
  return { name: 'ASIA / PACIFIC', isKillzone: false };
}

export function SidebarTelemetry({ collapsed }: { collapsed: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [utcHour, setUtcHour] = useState(14);
  const { tick } = usePrice('XAUUSD');
  const prevMidRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const updateTime = () => setUtcHour(new Date().getUTCHours());
    updateTime();
    const interval = setInterval(updateTime, 60_000);
    return () => clearInterval(interval);
  }, []);

  const session = mounted ? getCurrentSession(utcHour) : { name: 'MARKET LIVE', isKillzone: false };
  const mid = tick?.mid ?? null;

  // Direction is the current mid vs. the previous mid. The former check
  // (`tick.bid >= tick.ask`) could never be true for a live quote — bid always
  // sits below ask — so every live tick rendered bearish red.
  const prevMid = prevMidRef.current;
  const isBull = mid === null || prevMid === null ? true : mid >= prevMid;

  useEffect(() => {
    if (mid !== null) prevMidRef.current = mid;
  }, [mid]);

  if (collapsed) {
    return (
      <div className="py-1">
        <Tooltip
          label={`XAU/USD ${mid === null ? '---.--' : `$${mid.toFixed(2)}`} • ${session.name}`}
          side="right"
          className="w-full justify-center"
        >
          <Link
            href="/chart/XAUUSD"
            aria-label="Market benchmark XAU/USD"
            className="hover:border-brand/40 hover:text-brand text-fg-muted mx-auto flex size-10 flex-col items-center justify-center rounded-lg border border-white/[0.08] bg-black/40 transition-all"
          >
            <IconChartCandle className="text-brand size-4" />
            <span className="bg-bull size-1.5 rounded-full shadow-[0_0_6px_rgba(63,158,61,0.7)]" />
          </Link>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/40 p-2 font-mono shadow-xs transition-colors hover:border-white/[0.14]">
      {/* Session indicator */}
      <div className="text-fg-subtle flex items-center justify-between pb-1.5 text-[9px] tracking-wider uppercase">
        <span className="text-fg-muted flex items-center gap-1 font-medium">
          <IconClock className="text-fg-subtle size-3" />
          <span>{session.name}</span>
        </span>
        <span className="text-bull flex items-center gap-1 text-[8px] font-bold">
          <span className="bg-bull size-1.5 animate-pulse rounded-full shadow-[0_0_6px_rgba(63,158,61,0.7)]" />
          {session.isKillzone ? 'KILLZONE' : 'ACTIVE'}
        </span>
      </div>

      {/* Benchmark Instrument: XAU/USD */}
      <Link
        href="/chart/XAUUSD"
        prefetch={true}
        className="group hover:border-brand/30 flex items-center justify-between rounded border border-white/[0.04] bg-white/[0.02] px-2 py-1 transition-colors hover:bg-white/[0.04]"
        title="View XAUUSD Chart"
      >
        <span className="text-fg group-hover:text-brand text-xs font-bold tracking-tight transition-colors">
          XAU/USD
        </span>
        <div className="flex items-center gap-1.5 tabular-nums">
          <span
            data-testid="sidebar-telemetry-price"
            className={cn(
              'text-xs font-semibold',
              mid === null ? 'text-fg-subtle' : isBull ? 'text-bull' : 'text-bear',
            )}
          >
            {mid === null ? '---.--' : `$${mid.toFixed(2)}`}
          </span>
          <span className="text-fg-subtle/70 text-[9px]">GOLD</span>
        </div>
      </Link>
    </div>
  );
}
