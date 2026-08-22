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
import { IconClock, IconFlame } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

interface MarketSession {
  id: string;
  name: string;
  shortName: string;
  startHourUtc: number;
  endHourUtc: number;
}

const SESSIONS: MarketSession[] = [
  { id: 'asia', name: 'Tokyo / Asia', shortName: 'ASIA', startHourUtc: 0, endHourUtc: 9 },
  { id: 'london', name: 'London', shortName: 'LON', startHourUtc: 7, endHourUtc: 16 },
  { id: 'ny', name: 'New York', shortName: 'NY', startHourUtc: 12, endHourUtc: 21 },
];

function isSessionActive(s: MarketSession, utcHour: number): boolean {
  if (s.startHourUtc <= s.endHourUtc) {
    return utcHour >= s.startHourUtc && utcHour < s.endHourUtc;
  }
  return utcHour >= s.startHourUtc || utcHour < s.endHourUtc;
}

export function MarketSessionBar() {
  const [mounted, setMounted] = useState(false);
  const [utcTime, setUtcTime] = useState({ hour: 0, minute: 0, second: 0, str: '--:--:-- UTC' });

  useEffect(() => {
    setMounted(true);
    function update() {
      const d = new Date();
      const h = d.getUTCHours();
      const m = d.getUTCMinutes();
      const s = d.getUTCSeconds();
      const pad = (n: number) => n.toString().padStart(2, '0');
      setUtcTime({
        hour: h,
        minute: m,
        second: s,
        str: `${pad(h)}:${pad(m)}:${pad(s)} UTC`,
      });
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLondonNyOverlap = mounted && utcTime.hour >= 12 && utcTime.hour < 16;
  const isNyOpenKillzone = mounted && utcTime.hour >= 12 && utcTime.hour < 15;
  const isLondonOpenKillzone = mounted && utcTime.hour >= 7 && utcTime.hour < 10;

  return (
    <div
      aria-label="Global market trading sessions"
      className="border-border/50 bg-bg-elev-1/60 text-caption flex items-center justify-between border-b px-3 py-1 font-mono"
    >
      <div className="scrollbar-hide flex items-center gap-3 overflow-x-auto py-0.5">
        <div className="text-fg-subtle flex shrink-0 items-center gap-1.5">
          <IconClock className="text-fg-subtle size-3.5" />
          <span className="text-fg-muted font-medium tabular-nums">{utcTime.str}</span>
        </div>

        <div className="bg-border h-3 w-px shrink-0" />

        <div className="flex shrink-0 items-center gap-1.5">
          {SESSIONS.map((s) => {
            const active = mounted && isSessionActive(s, utcTime.hour);
            return (
              <span
                key={s.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-wider transition-colors',
                  active
                    ? 'bg-bull/15 text-bull border-bull/30 border'
                    : 'bg-bg-elev-2 text-fg-subtle/70 border-border/40 border',
                )}
                title={`${s.name} Session (${s.startHourUtc}:00 - ${s.endHourUtc}:00 UTC)`}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    active ? 'bg-bull animate-pulse' : 'bg-fg-subtle/40',
                  )}
                />
                {s.shortName}
              </span>
            );
          })}
        </div>

        {(isLondonNyOverlap || isNyOpenKillzone || isLondonOpenKillzone) && (
          <>
            <div className="bg-border h-3 w-px shrink-0" />
            <span
              className="bg-brand/15 border-brand/40 text-brand inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider"
              title="High volatility killzone window"
            >
              <IconFlame className="text-brand size-3 animate-pulse" />
              {isLondonNyOverlap ? 'OVERLAP KILLZONE' : isNyOpenKillzone ? 'NY OPEN' : 'LON OPEN'}
            </span>
          </>
        )}
      </div>

      <div className="text-fg-subtle/80 hidden shrink-0 items-center gap-2 text-[10px] sm:flex">
        <span>24H FX/GOLD</span>
      </div>
    </div>
  );
}
