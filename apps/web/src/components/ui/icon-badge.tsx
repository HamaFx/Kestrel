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

// <IconBadge> — Shared neo-skeuomorphic hardware housing for icons across
// PageHeader, ConfirmDrawer, EmptyState, MutationConfirmationCard, and widgets.
// Eliminates ad-hoc span/div icon wrappers with drifting border-radii and borders.

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

export type IconBadgeTone = 'brand' | 'neutral' | 'bull' | 'bear' | 'danger' | 'warn' | 'info';
export type IconBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface IconBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: IconBadgeTone;
  size?: IconBadgeSize;
  /** Optional subtle corner reticle micro-accents for hero/header instrument badges. */
  reticle?: boolean;
  children: ReactNode;
}

const TONE_STYLES: Record<IconBadgeTone, string> = {
  brand:
    'icon-housing-brand text-brand border-brand/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_10px_rgba(255,54,22,0.16)]',
  neutral:
    'icon-housing text-fg-muted border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_2px_6px_rgba(0,0,0,0.4)]',
  bull: 'bg-bull/10 text-bull border-bull/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(63,158,61,0.14)]',
  bear: 'bg-bear/10 text-bear border-bear/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(240,62,62,0.14)]',
  danger:
    'bg-danger/10 text-danger border-danger/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(240,62,62,0.14)]',
  warn: 'bg-warn/10 text-warn border-warn/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(217,143,0,0.14)]',
  info: 'bg-info/10 text-info border-info/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(79,163,181,0.14)]',
};

const SIZE_STYLES: Record<IconBadgeSize, string> = {
  xs: 'size-6 rounded-md',
  sm: 'size-8 rounded-lg',
  md: 'h-10 w-10 rounded-md',
  lg: 'size-11 rounded-xl',
  xl: 'h-16 w-16 rounded-xl',
};

export function IconBadge({
  tone = 'neutral',
  size = 'md',
  reticle = false,
  className,
  children,
  ...rest
}: IconBadgeProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'surface-chip relative inline-flex shrink-0 items-center justify-center overflow-hidden border transition-colors duration-150',
        TONE_STYLES[tone],
        SIZE_STYLES[size],
        className,
      )}
      {...rest}
    >
      {reticle ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 left-1 size-1 border-t border-l border-current opacity-40"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1 bottom-1 size-1 border-r border-b border-current opacity-40"
          />
        </>
      ) : null}
      <span className="relative z-10 inline-flex items-center justify-center">{children}</span>
    </span>
  );
}
