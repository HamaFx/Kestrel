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

import type { Alert, EconomicEvent, JournalEntry } from '@kestrel/shared';
import {
  IconActivity,
  IconArrowRight,
  IconBrain,
  IconCompass,
  IconShieldCheck,
} from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';

import { getSessionInfo } from '@/lib/auth/session';
import { cn } from '@/lib/formatters/cn';
import { STRATEGIST_DESK_LIST } from '@/lib/kestrel-strategist-desks';

import { PreSessionChecklistDrawer } from './pre-session-checklist-drawer';
import { QuickLogTradeDrawer } from './quick-log-trade-drawer';
import { StrategistDeskCard } from './strategist-desk-card';

interface MissionControlDeckProps {
  alerts?: readonly Alert[];
  events?: readonly EconomicEvent[];
  entries?: readonly JournalEntry[];
  briefing?: {
    messageId: string;
    body: string;
    summary: string;
  } | null;
}

export function MissionControlDeck({
  alerts = [],
  events = [],
  entries = [],
  briefing = null,
}: MissionControlDeckProps) {
  const sessionInfo = getSessionInfo(new Date());
  const activeAlertsCount = alerts.filter((a) => a.active).length;
  const openEntriesCount = entries.filter((e) => e.closedAt === null && e.exit === null).length;

  return (
    <section aria-label="Mission Control Deck" className="relative mb-2 flex flex-col gap-4 overflow-hidden rounded-2xl">
      {/* ── 1. Archival Pediment Header Banner ── */}
      <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-5 sm:p-6 md:flex-row md:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 z-0 h-64 w-96 opacity-15 mix-blend-luminosity select-none"
        >
          <Image
            src="/landing/desks-council-strategists.webp"
            alt=""
            fill
            unoptimized
            className="object-contain object-right"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#111114]/60 to-[#111114]" />
        </div>

        <div className="relative z-10 flex max-w-2xl flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[#D4AF37] uppercase">
              INSTITUTIONAL MULTI-AGENT COMMAND DECK
            </span>
            <span className="size-1.5 animate-pulse rounded-full bg-[#D4AF37]" />
          </div>

          <h2 className="font-display text-2xl font-normal tracking-[-0.03em] text-[#F4F1EA] sm:text-3xl">
            The Council of <span className="font-serif italic text-[#D4AF37]">Four Strategists</span>
          </h2>

          <p className="max-w-xl text-xs leading-relaxed text-[#F4F1EA]/70 sm:text-sm">
            Autonomous multi-desk committee operating in parallel. Macro horizon, quant liquidity,
            and mathematical risk governor synthesized by the Arbiter into high-expectancy trade directives.
          </p>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2.5 md:mt-0 md:flex-col md:items-end">
          <Link
            href="/chat?mode=council"
            className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37] px-4 py-2 font-mono text-xs font-semibold tracking-wider text-[#09090B] uppercase shadow-md transition-all hover:bg-[#F4F1EA] hover:text-[#09090B] active:translate-y-[0.5px]"
          >
            <span>Convene Full Council</span>
            <IconArrowRight className="size-3.5" />
          </Link>

          <div className="flex items-center gap-2">
            <PreSessionChecklistDrawer />
            <QuickLogTradeDrawer />
          </div>
        </div>
      </div>

      {/* ── 2. Tactical Telemetry Strip (4-Column Grid) ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <div className="relative flex flex-col justify-between gap-1.5 rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-3.5 transition-colors hover:border-[#D4AF37]/30">
          <div className="flex items-center justify-between text-xs text-[#F4F1EA]/60">
            <span className="font-mono text-[10px] tracking-wider uppercase">Market Regime</span>
            <IconCompass className="size-3.5 text-[#D4AF37]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm font-semibold tracking-wide text-[#F4F1EA] uppercase">
              {sessionInfo.label} Session
            </span>
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase',
                sessionInfo.session !== 'closed' && sessionInfo.session !== 'weekend'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-[#F4F1EA]/10 bg-[#16161A] text-[#F4F1EA]/50',
              )}
            >
              {sessionInfo.session !== 'closed' && sessionInfo.session !== 'weekend' ? 'Active' : 'Off-Peak'}
            </span>
          </div>
        </div>

        <div className="relative flex flex-col justify-between gap-1.5 rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-3.5 transition-colors hover:border-[#D4AF37]/30">
          <div className="flex items-center justify-between text-xs text-[#F4F1EA]/60">
            <span className="font-mono text-[10px] tracking-wider uppercase">Council Status</span>
            <IconBrain className="size-3.5 text-[#7DD3FC]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm font-semibold text-[#F4F1EA]">4/4 Desks</span>
            <span className="rounded border border-[#7DD3FC]/30 bg-[#7DD3FC]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#7DD3FC] uppercase">
              Synchronized
            </span>
          </div>
        </div>

        <div className="relative flex flex-col justify-between gap-1.5 rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-3.5 transition-colors hover:border-[#D4AF37]/30">
          <div className="flex items-center justify-between text-xs text-[#F4F1EA]/60">
            <span className="font-mono text-[10px] tracking-wider uppercase">Risk Governor</span>
            <IconShieldCheck className="size-3.5 text-[#F87171]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm font-semibold tabular-nums text-[#F4F1EA]">
              {openEntriesCount} Active {openEntriesCount === 1 ? 'Trade' : 'Trades'}
            </span>
            <span className="rounded border border-[#F87171]/30 bg-[#F87171]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#F87171] uppercase">
              1.0% Max Cap
            </span>
          </div>
        </div>

        <div className="relative flex flex-col justify-between gap-1.5 rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-3.5 transition-colors hover:border-[#D4AF37]/30">
          <div className="flex items-center justify-between text-xs text-[#F4F1EA]/60">
            <span className="font-mono text-[10px] tracking-wider uppercase">Telemetry Pulse</span>
            <IconActivity className="size-3.5 text-[#D4AF37]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm font-semibold tabular-nums text-[#F4F1EA]">
              {activeAlertsCount} {activeAlertsCount === 1 ? 'Alert' : 'Alerts'} Live
            </span>
            <span className="rounded border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#D4AF37] uppercase">
              {briefing ? 'Briefed' : 'Standby'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. The Four Strategist Desk Cards (4-Column Grid) ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STRATEGIST_DESK_LIST.map((desk) => (
          <StrategistDeskCard key={desk.id} desk={desk} />
        ))}
      </div>
    </section>
  );
}
