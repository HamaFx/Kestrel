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
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    setMounted(true);
    const updateTime = () => setUtcHour(new Date().getUTCHours());
    updateTime();
    const interval = setInterval(updateTime, 60_000);
    return () => clearInterval(interval);
  }, []);

  const session = mounted ? getCurrentSession(utcHour) : { name: 'MARKET LIVE', isKillzone: false };
  const price = tick?.mid ? tick.mid.toFixed(2) : '2734.50';
  const isBull = tick ? tick.bid >= (tick.ask || tick.mid) : true;

  if (collapsed) {
    return (
      <div className="py-1">
        <Tooltip
          label={`XAU/USD $${price} • ${session.name}`}
          side="right"
          className="w-full justify-center"
        >
          <Link
            href="/chart/XAUUSD"
            aria-label="Market benchmark XAU/USD"
            className="mx-auto flex size-10 flex-col items-center justify-center rounded-lg border border-white/[0.08] bg-black/40 text-fg-muted transition-all hover:border-brand/40 hover:text-brand"
          >
            <IconChartCandle className="size-4 text-brand" />
            <span className="size-1.5 rounded-full bg-bull shadow-[0_0_6px_rgba(0,230,118,0.8)]" />
          </Link>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/40 p-2 font-mono shadow-xs transition-colors hover:border-white/[0.14]">
      {/* Session indicator */}
      <div className="flex items-center justify-between pb-1.5 text-[9px] text-fg-subtle tracking-wider uppercase">
        <span className="flex items-center gap-1 font-medium text-fg-muted">
          <IconClock className="size-3 text-fg-subtle" />
          <span>{session.name}</span>
        </span>
        <span className="flex items-center gap-1 font-bold text-bull text-[8px]">
          <span className="size-1.5 rounded-full bg-bull animate-pulse shadow-[0_0_6px_rgba(0,230,118,0.8)]" />
          {session.isKillzone ? 'KILLZONE' : 'ACTIVE'}
        </span>
      </div>

      {/* Benchmark Instrument: XAU/USD */}
      <Link
        href="/chart/XAUUSD"
        prefetch={true}
        className="group flex items-center justify-between rounded border border-white/[0.04] bg-white/[0.02] px-2 py-1 transition-colors hover:border-brand/30 hover:bg-white/[0.04]"
        title="View XAUUSD Chart"
      >
        <span className="text-xs font-bold tracking-tight text-fg group-hover:text-brand transition-colors">
          XAU/USD
        </span>
        <div className="flex items-center gap-1.5 tabular-nums">
          <span className={cn('text-xs font-semibold', isBull ? 'text-bull' : 'text-bear')}>
            ${price}
          </span>
          <span className="text-[9px] text-fg-subtle/70">GOLD</span>
        </div>
      </Link>
    </div>
  );
}
