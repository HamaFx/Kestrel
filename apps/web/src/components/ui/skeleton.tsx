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

// <Skeleton> — single placeholder primitive. All loading.tsx files and
// in-component placeholders should use this so the loading aesthetic stays
// consistent across the app. Uses the `.shimmer` CSS animation defined in
// globals.css (which gracefully degrades under prefers-reduced-motion).

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Hide decorative placeholders from assistive technology. */
  decorative?: boolean;
}

export function Skeleton({ className, decorative = false, ...rest }: SkeletonProps) {
  return (
    <div
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'status', 'aria-label': 'Loading content' })}
      className={cn('shimmer rounded-sm', className)}
      {...rest}
    />
  );
}

interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Approximate row count (h-3 lines). */
  lines?: number;
}

/** Shimmering card placeholder matching the codebase's `surface-panel`. */
export function SkeletonCard({ className, lines = 2, ...rest }: SkeletonCardProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading content"
      className={cn(
        'border-border bg-bg-elev-1/60 fade-in flex flex-col gap-2 overflow-hidden rounded-sm border p-4',
        className,
      )}
      {...rest}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          decorative

          className="h-3"
          style={{ width: `${100 - i * 18}%` }}
        />
      ))}
    </div>
  );
}
