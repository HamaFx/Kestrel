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
//
// Every tone maps to exactly one `icon-housing*` utility that owns its own
// background, border, colour and box-shadow. That is deliberate: Tailwind v4
// emits custom `@utility` rules *after* the core colour utilities inside
// `@layer utilities`, so a flat `bg-danger/10` + `border-danger/30` layered on
// top of a housing utility is silently overridden and every tone renders as the
// neutral surface. Adding a tint here means adding a housing utility too — see
// the semantic tone housings in apps/web/src/app/globals.css.

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
  brand: 'icon-housing-brand',
  neutral: 'icon-housing',
  bull: 'icon-housing-bull',
  bear: 'icon-housing-bear',
  danger: 'icon-housing-danger',
  warn: 'icon-housing-warn',
  info: 'icon-housing-info',
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
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden transition-colors duration-150',
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
