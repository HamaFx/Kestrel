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
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { EmberLedMatrix } from '@/components/ui/ember-led-matrix';
import { cn } from '@/lib/formatters/cn';

interface ActivityRollupProps {
  toolCount: number;
  thinkingCount?: number;
  isRunning?: boolean;
  defaultOpen?: boolean;
  summaries?: string[];
  children: ReactNode;
}

export function ActivityRollup({
  toolCount,
  thinkingCount = 0,
  isRunning = false,
  defaultOpen = false,
  summaries = [],
  children,
}: ActivityRollupProps) {
  const [open, setOpen] = useState(defaultOpen || isRunning);
  const [elapsedMs, setElapsedMs] = useState(0);
  const wasRunningRef = useRef(isRunning);
  const startTimeRef = useRef<number | null>(isRunning ? Date.now() : null);

  useEffect(() => {
    if (isRunning) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      wasRunningRef.current = true;
      setOpen(true);
      const timer = window.setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 100);
      return () => window.clearInterval(timer);
    }

    if (wasRunningRef.current) {
      wasRunningRef.current = false;
      if (startTimeRef.current !== null) {
        setElapsedMs(Date.now() - startTimeRef.current);
        startTimeRef.current = null;
      }
      // Auto-collapse once all tool checks finish so the chat thread stays calm.
      setOpen(false);
    }
  }, [isRunning]);

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

  const visibleSummaries = summaries.slice(0, 3);

  return (
    <div className="my-2 w-full select-none">
      <div className="hover:border-brand/40 rounded-xl border border-white/[0.08] bg-[#141416]/85 p-1 shadow-sm transition-all">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors',
            'hover:bg-bg-elev-2 active:translate-y-[0.5px]',
            isRunning ? 'text-fg' : 'text-fg-muted',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="bg-bg-elev-2 text-brand grid size-5 shrink-0 place-items-center rounded border border-white/[0.08]">
              {isRunning ? <EmberLedMatrix /> : <IconCpu className="text-brand size-3.5" />}
            </span>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="text-brand shrink-0 font-semibold tracking-wider uppercase">
                {isRunning ? 'EXECUTION IN PROGRESS' : 'EXECUTION LEDGER'}
              </span>
              <span className="text-fg-subtle hidden sm:inline">·</span>
              <span className="text-fg-muted truncate font-mono text-[11px]">{label}</span>

              {!open && !isRunning && visibleSummaries.length > 0 ? (
                <div className="hidden items-center gap-1.5 lg:flex">
                  {visibleSummaries.map((badge, i) => (
                    <span
                      key={`${badge}-${i}`}
                      className="surface-chip text-fg-muted rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="text-fg-subtle flex shrink-0 items-center gap-2 text-[11px]">
            {(isRunning || elapsedMs > 0) && (
              <span
                className={cn(
                  'font-mono text-[10px] tabular-nums',
                  isRunning ? 'text-brand' : 'text-fg-subtle',
                )}
              >
                {(elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className="hidden font-mono md:inline">
              {open ? 'Hide Trace ▲' : 'Inspect Ledger ▼'}
            </span>
            <IconChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform duration-150',
                open ? 'text-brand rotate-180' : 'text-fg-subtle',
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
              <div className="border-border/30 mt-1 flex flex-col gap-1 border-t px-2 py-2 font-mono text-xs">
                {children}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
