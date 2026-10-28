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

// <Tooltip> — minimal CSS-only tooltip primitive.
import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

interface TooltipProps {
  /** Bubble text. Always provide an `aria-label` on the trigger to match. */
  label: string;
  /** Position relative to the trigger. Default 'top'. */
  side?: 'top' | 'bottom' | 'right' | 'left';
  /** Optional keyboard shortcut string to render in <kbd> badge */
  shortcut?: string;
  /** Wrap a single interactive element (button/anchor). */
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, side = 'top', shortcut, children, className }: TooltipProps) {
  return (
    <span className={cn('group/tooltip relative inline-flex items-center', className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute z-50',
          'text-body-sm rounded-lg px-2.5 py-1 font-medium whitespace-nowrap',
          'surface-elevated text-fg shadow-lg',
          'opacity-0 transition-opacity duration-150',
          'group-hover/tooltip:opacity-100 group-hover/tooltip:delay-300',
          'group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:delay-0',
          side === 'top' && '-top-9 left-1/2 -translate-x-1/2',
          side === 'bottom' && 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2',
          side === 'right' && 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2',
          side === 'left' && 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2',
        )}
      >
        <span className="flex items-center gap-1.5">
          <span>{label}</span>
          {shortcut && <kbd className="kbd-keycap">{shortcut}</kbd>}
        </span>
      </span>
    </span>
  );
}
