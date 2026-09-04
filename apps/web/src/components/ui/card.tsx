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

/**
 * Shared flat card primitives for dashboard widgets and chat result surfaces.
 *
 * The shell owns the terminal surface, border, radius, spacing, and overflow
 * rules. Content-specific components remain responsible for their hierarchy.
 */

import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Use a semantic section/article without duplicating the shell classes. */
  as?: 'div' | 'section' | 'article';
}

export function Card({ as = 'div', className, ...props }: CardProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'border-border bg-bg-elev-1 surface-panel flex flex-col gap-3 rounded-xl border p-4 shadow-[var(--shadow-chip)] backdrop-blur-md transition-all',
      className,
    ),
  });
}

interface CardSlotProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function CardHeader({ className, ...props }: CardSlotProps) {
  return <div className={cn('flex items-center justify-between gap-2', className)} {...props} />;
}

export function CardContent({ className, ...props }: CardSlotProps) {
  return <div className={cn('min-w-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: CardSlotProps) {
  return <div className={cn('mt-auto flex items-center gap-2', className)} {...props} />;
}
