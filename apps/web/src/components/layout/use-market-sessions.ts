// SPDX-License-Identifier: Apache-2.0

'use client';

// Shared market-session clock: one minute-resolution UTC read used by both the
// session dock inside the unified `TelemetryRibbon`. Keeping the
// session math here means the two surfaces can never drift apart.
import { useEffect, useState } from 'react';

import { useTime } from '@/components/providers/time-provider';

interface MarketSession {
  id: string;
  name: string;
  shortName: string;
  startHourUtc: number;
  endHourUtc: number;
}

const MARKET_SESSIONS: readonly MarketSession[] = [
  { id: 'asia', name: 'Tokyo / Asia', shortName: 'ASIA', startHourUtc: 0, endHourUtc: 9 },
  { id: 'london', name: 'London', shortName: 'LON', startHourUtc: 7, endHourUtc: 16 },
  { id: 'ny', name: 'New York', shortName: 'NY', startHourUtc: 12, endHourUtc: 21 },
];

function isSessionActive(session: MarketSession, utcHour: number): boolean {
  if (session.startHourUtc <= session.endHourUtc) {
    return utcHour >= session.startHourUtc && utcHour < session.endHourUtc;
  }
  return utcHour >= session.startHourUtc || utcHour < session.endHourUtc;
}

export function useMarketSessions() {
  const { now } = useTime();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const d = new Date(now);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hour = d.getUTCHours();
  const weekday = d.getUTCDay();

  const isWeekend =
    mounted && ((weekday === 5 && hour >= 22) || weekday === 6 || (weekday === 0 && hour < 22));
  const isLondonNyOverlap = mounted && !isWeekend && hour >= 12 && hour < 16;
  const isNyOpenKillzone = mounted && !isWeekend && hour >= 12 && hour < 15;
  const isLondonOpenKillzone = mounted && !isWeekend && hour >= 7 && hour < 10;
  const isKillzoneActive = isLondonNyOverlap || isNyOpenKillzone || isLondonOpenKillzone;

  const sessions = MARKET_SESSIONS.map((session) => ({
    ...session,
    active: mounted && !isWeekend && isSessionActive(session, hour),
  }));

  return {
    mounted,
    utcStr: `${pad(hour)}:${pad(d.getUTCMinutes())} UTC`,
    utcHour: hour,
    isWeekend,
    sessions,
    isKillzoneActive,
    killzoneLabel: isLondonNyOverlap
      ? 'LON/NY OVERLAP'
      : isNyOpenKillzone
        ? 'NY OPEN'
        : 'LONDON OPEN',
  };
}
