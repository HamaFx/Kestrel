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

// <Badge> — shared status/role/severity pill. Replaces the repeated
// inline `cn('rounded-sm px-2 py-0.5 text-xs font-bold uppercase', ...)`
// pattern used across admin tabs, settings, and elsewhere.
//
// Tones map to existing design tokens:
//   success  → bg-success/10 text-success
//   danger   → bg-danger/10 text-danger
//   warn     → bg-warn/10 text-warn
//   brand    → bg-brand/10 text-brand
//   neutral  → bg-bg-elev-2 text-fg-muted

import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

export type BadgeTone = 'success' | 'danger' | 'warn' | 'brand' | 'info' | 'neutral';

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warn: 'bg-warn/10 text-warn',
  brand: 'bg-brand/10 text-brand',
  info: 'bg-info/10 text-info',
  neutral: 'bg-bg-elev-2 text-fg-muted',
};

const dotClasses: Record<BadgeTone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warn: 'bg-warn',
  brand: 'bg-brand',
  info: 'bg-info',
  neutral: 'bg-fg-muted',
};

export function Badge({ tone = 'neutral', dot = false, children, className }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase',
        toneClasses[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', dotClasses[tone])} />
      ) : null}
      {children}
    </span>
  );
}
