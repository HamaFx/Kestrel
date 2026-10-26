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

// <SidebarDeskHud> — Mini-HUD docked under the Research navigation link
// displaying real-time operational status for Kestrel's 4 AI Trading Desks:
// Horus (Macro), Astrolabe (Technical), Hoplite (Risk), and Council (Flow).

import {
  IconAlertTriangle,
  IconBriefcase,
  IconRadar,
  IconTrendingUp,
} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';

interface DeskSpec {
  id: string;
  name: string;
  code: string;
  icon: typeof IconBriefcase;
  tone: 'brand' | 'bull' | 'warn' | 'info';
  status: 'READY' | 'ACTIVE';
}

const DESKS: DeskSpec[] = [
  {
    id: 'macro',
    name: 'Macro',
    code: 'DESK-I',
    icon: IconBriefcase,
    tone: 'brand',
    status: 'READY',
  },
  {
    id: 'technical',
    name: 'Tech',
    code: 'DESK-II',
    icon: IconTrendingUp,
    tone: 'bull',
    status: 'READY',
  },
  {
    id: 'risk',
    name: 'Risk',
    code: 'DESK-III',
    icon: IconAlertTriangle,
    tone: 'warn',
    status: 'READY',
  },
  {
    id: 'flow',
    name: 'Flow',
    code: 'DESK-IV',
    icon: IconRadar,
    tone: 'info',
    status: 'READY',
  },
];

export function SidebarDeskHud({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <Tooltip label="4-Desk AI Committee: Ready" side="right" className="w-full justify-center">
        <Link
          href="/chat"
          className="mx-auto flex size-8 items-center justify-center rounded-md border border-white/[0.08] bg-black/40 text-fg-subtle transition-all hover:border-brand/40 hover:text-brand"
          aria-label="4-Desk AI Committee"
        >
          <div className="grid grid-cols-2 gap-0.5">
            <span className="size-1 rounded-full bg-brand" />
            <span className="size-1 rounded-full bg-bull" />
            <span className="size-1 rounded-full bg-warn" />
            <span className="size-1 rounded-full bg-info" />
          </div>
        </Link>
      </Tooltip>
    );
  }

  return (
    <div className="my-1 rounded-lg border border-white/[0.08] bg-black/40 p-2 font-mono shadow-xs">
      <div className="flex items-center justify-between pb-1 text-[9px] tracking-wider text-fg-subtle uppercase">
        <span className="flex items-center gap-1 text-fg-muted font-semibold">
          <span>AI COMMITTEE</span>
        </span>
        <span className="flex items-center gap-1 text-bull font-bold text-[8px]">
          <span className="size-1.5 rounded-full bg-bull animate-pulse shadow-[0_0_6px_rgba(0,230,118,0.8)]" />
          4 DESKS
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 pt-0.5">
        {DESKS.map((d) => {
          const Icon = d.icon;
          return (
            <div
              key={d.id}
              className="flex items-center gap-1.5 rounded border border-white/[0.04] bg-white/[0.02] px-1.5 py-1 text-[10px] text-fg-muted transition-colors hover:border-white/[0.1] hover:text-fg"
            >
              <Icon
                className={cn(
                  'size-3 shrink-0',
                  d.tone === 'brand' && 'text-brand',
                  d.tone === 'bull' && 'text-bull',
                  d.tone === 'warn' && 'text-warn',
                  d.tone === 'info' && 'text-info',
                )}
                aria-hidden="true"
              />
              <span className="truncate">{d.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
