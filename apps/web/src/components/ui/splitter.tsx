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

// <Splitter> — PanelUI-inspired accessible resize handle (`role="separator"`).
// Supports vertical (column resize) and horizontal (row resize) pointer capture
// and keyboard arrow/Home navigation.

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

interface SplitterProps extends HTMLAttributes<HTMLDivElement> {
  orientation: 'horizontal' | 'vertical';
  label: string;
  value: number;
  min: number;
  max: number;
  active?: boolean;
  onReset?: () => void;
  onStep?: (direction: -1 | 1) => void;
}

export function Splitter({
  orientation,
  label,
  value,
  min,
  max,
  active = false,
  onReset,
  onStep,
  onKeyDown,
  className,
  ...rest
}: SplitterProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div
      role="separator"
      tabIndex={0}
      data-slot="splitter"
      data-orientation={orientation}
      data-active={active || undefined}
      aria-orientation={orientation}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      title="Drag to resize (double-click to reset)"
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const decKey = isVertical ? 'ArrowLeft' : 'ArrowUp';
        const incKey = isVertical ? 'ArrowRight' : 'ArrowDown';
        if (event.key === decKey && onStep) {
          event.preventDefault();
          onStep(-1);
        } else if (event.key === incKey && onStep) {
          event.preventDefault();
          onStep(1);
        } else if (event.key === 'Home' && onReset) {
          event.preventDefault();
          onReset();
        }
      }}
      className={cn(
        'group focus-visible:ring-brand items-center justify-center transition-colors focus-visible:ring-1 focus-visible:outline-none',
        isVertical ? 'w-2 cursor-col-resize' : 'flex h-2 shrink-0 cursor-row-resize',
        active ? 'bg-brand/25' : 'hover:bg-brand/15',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-full transition-colors',
          isVertical ? 'h-10 w-[2px]' : 'h-[2px] w-10',
          active ? 'bg-brand' : 'bg-white/15 group-hover:bg-brand/70',
        )}
      />
    </div>
  );
}
