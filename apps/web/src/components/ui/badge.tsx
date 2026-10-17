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

import { cn } from '@/lib/cn';

export type BadgeTone = 'success' | 'danger' | 'warn' | 'brand' | 'neutral';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warn: 'bg-warn/10 text-warn',
  brand: 'bg-brand/10 text-brand',
  neutral: 'bg-bg-elev-2 text-fg-muted',
};

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider font-mono',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
