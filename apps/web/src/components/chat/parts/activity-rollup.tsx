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

import { IconChevronDown, IconClock } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

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
    parts.push(`${toolCount} ${toolCount === 1 ? 'tool call' : 'tool calls'}`);
  }
  if (thinkingCount > 0) {
    parts.push(`${thinkingCount} ${thinkingCount === 1 ? 'thinking step' : 'thinking steps'}`);
  }

  const label = isRunning
    ? `Working (${parts.join(', ') || 'running…'})`
    : `Activity (${parts.join(', ')})`;

  return (
    <div className="w-full my-1 select-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'group text-fg-subtle hover:text-fg flex items-center gap-2 rounded-md py-1 pr-2 text-left text-body transition-colors active:translate-y-[0.5px]',
          isRunning && 'text-fg',
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {isRunning ? (
            <span className="border-brand/30 border-t-brand size-3 animate-spin rounded-full border-[1.5px]" />
          ) : (
            <IconClock className="size-3.5 text-fg-subtle group-hover:text-fg" />
          )}
        </span>

        <span className="font-mono text-caption text-fg-muted font-medium">{label}</span>

        <IconChevronDown
          className={cn(
            'text-fg-subtle size-3 shrink-0 transition-transform duration-150',
            open ? 'rotate-180 opacity-100' : 'opacity-60 group-hover:opacity-100',
          )}
        />
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
            <div className="border-border/40 mt-1 flex flex-col gap-0.5 border-l pl-2">
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
