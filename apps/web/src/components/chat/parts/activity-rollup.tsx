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

import { IconChevronDown, IconCpu } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

interface ActivityRollupProps {
  toolCount: number;
  thinkingCount?: number;
  isRunning?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ActivityRollup({
  toolCount,
  thinkingCount = 0,
  isRunning = false,
  defaultOpen = false,
  children,
}: ActivityRollupProps) {
  const [open, setOpen] = useState(defaultOpen || isRunning);

  const parts: string[] = [];
  if (toolCount > 0) {
    parts.push(`${toolCount} ${toolCount === 1 ? 'market data check' : 'market data checks'}`);
  }
  if (thinkingCount > 0) {
    parts.push(`${thinkingCount} ${thinkingCount === 1 ? 'analysis step' : 'analysis steps'}`);
  }

  const label = isRunning
    ? `Researching live market data (${parts.join(', ') || 'in progress…'})`
    : `Market research (${parts.join(', ')})`;

  return (
    <div className="my-2 w-full select-none">
      <div className="rounded-xl border border-[#F4F1EA]/10 bg-[#09090B] p-1 shadow-sm transition-all hover:border-[#D4AF37]/30">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors',
            'hover:bg-[#16161A] active:translate-y-[0.5px]',
            isRunning ? 'text-[#F4F1EA]' : 'text-[#F4F1EA]/70',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded bg-[#16161A] border border-[#F4F1EA]/10 text-[#D4AF37]">
              {isRunning ? (
                <span className="size-3 animate-spin rounded-full border-[1.5px] border-[#D4AF37]/30 border-t-[#D4AF37]" />
              ) : (
                <IconCpu className="size-3.5 text-[#D4AF37]" />
              )}
            </span>

            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-wider text-[#D4AF37] uppercase">
                {isRunning ? 'EXECUTION IN PROGRESS' : 'EXECUTION LEDGER'}
              </span>
              <span className="hidden sm:inline text-[#F4F1EA]/30">·</span>
              <span className="text-[#F4F1EA]/60 font-mono text-[11px]">{label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#F4F1EA]/60">
            <span className="hidden md:inline font-mono">
              {open ? 'Hide Trace ▲' : 'Inspect Ledger ▼'}
            </span>
            <IconChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform duration-150',
                open ? 'rotate-180 text-[#D4AF37]' : 'text-[#F4F1EA]/40',
              )}
            />
          </div>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-1 border-t border-[#F4F1EA]/10 px-2 py-2 flex flex-col gap-1 font-mono text-xs">
                {children}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
