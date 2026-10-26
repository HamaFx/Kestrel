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

// Market strip for the rail: which session is open, and the benchmark price.
//
// Quiet by design — it is ambient state, not a notification. Session name is
// prose (Funnel Sans); the price is a figure (Geist Mono, tabular). No pulsing
// status dot and no "KILLZONE/ACTIVE" chip: the colour of the price already
// says which way it moved, and the session line already says it is open.
import { IconChartCandle } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useEffect, useRef, useState } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { usePrice } from '@/hooks/use-prices';
import { cn } from '@/lib/formatters/cn';

/** Session label for a UTC hour — prose, not shouting. */
function getCurrentSession(utcHour: number): string {
  if (utcHour >= 12 && utcHour < 16) return 'London × New York';
  if (utcHour >= 16 && utcHour < 21) return 'New York open';
  if (utcHour >= 7 && utcHour < 12) return 'London open';
  return 'Asia–Pacific';
}

export function SidebarTelemetry({ collapsed }: { collapsed: boolean }) {
  const [utcHour, setUtcHour] = useState<number | null>(null);
  const { tick } = usePrice('XAUUSD');
  const prevMidRef = useRef<number | null>(null);

  useEffect(() => {
    const updateTime = () => setUtcHour(new Date().getUTCHours());
    updateTime();
    const interval = setInterval(updateTime, 60_000);
    return () => clearInterval(interval);
  }, []);

  const mid = tick?.mid ?? null;
  const price = mid === null ? null : `$${mid.toFixed(2)}`;
  const session = utcHour === null ? null : getCurrentSession(utcHour);

  // Direction is the current mid vs. the previous mid. (The former check,
  // `tick.bid >= tick.ask`, could never be true for a live quote.)
  const prevMid = prevMidRef.current;
  const isBull = mid === null || prevMid === null ? true : mid >= prevMid;

  useEffect(() => {
    if (mid !== null) prevMidRef.current = mid;
  }, [mid]);

  const label = `XAU/USD ${price ?? '---.--'}${session ? ` · ${session}` : ''}`;

  if (collapsed) {
    return (
      <Tooltip label={label} side="right" className="w-full justify-center">
        <Link
          href="/chart/XAUUSD"
          aria-label={label}
          className="bg-bg-elev-2/60 text-fg-muted hover:border-brand/40 hover:text-brand mx-auto flex size-10 items-center justify-center rounded-lg border border-white/[0.06] transition-colors"
        >
          <IconChartCandle className="size-4.5" aria-hidden="true" />
        </Link>
      </Tooltip>
    );
  }

  return (
    <Link
      href="/chart/XAUUSD"
      prefetch={true}
      aria-label={`${label}. Open the live chart.`}
      className="bg-bg-elev-2/60 hover:border-brand/30 flex flex-col gap-1 rounded-lg border border-white/[0.06] px-2.5 py-2 transition-colors"
    >
      <span className="text-fg-subtle truncate font-sans text-[10px] tracking-wide">
        {session ?? 'Market'}
      </span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-fg font-sans text-[12px] font-medium tracking-tight">XAU/USD</span>
        <span
          data-testid="sidebar-telemetry-price"
          className={cn(
            'font-mono text-[12px] font-medium tabular-nums',
            mid === null ? 'text-fg-subtle' : isBull ? 'text-bull' : 'text-bear',
          )}
        >
          {price ?? '---.--'}
        </span>
      </span>
    </Link>
  );
}
