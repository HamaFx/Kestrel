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

// Shared skeleton and error card components for chat tool parts (CC-10).
// Import from here instead of redefining per-file SkeletonCard/ErrorCard.

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

export interface SharedSkeletonCardProps {
  /** Accessible label for the loading state. */
  label?: string;
  /** Number of shimmering row placeholders. Defaults to 3. */
  rows?: number;
  /** Extra class on the wrapper. */
  className?: string;
}

/**
 * Skeleton card for chat tool parts. Shows a shimmering placeholder
 * with configurable row count and an aria-busy label.
 */
export function PartSkeletonCard({
  label = 'Loading',
  rows = 3,
  className,
}: SharedSkeletonCardProps) {
  return (
    <Card role="status" className={cn('p-3', className)} aria-busy="true" aria-label={label}>
      <Skeleton className="h-4 w-1/2" />
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${100 - i * 15}%` }} />
        ))}
      </div>
    </Card>
  );
}

export interface SharedErrorCardProps {
  /** Error message to display. */
  message?: string;
  /** Prefix label shown before the message. Defaults to "Tool failed". */
  label?: string;
}

/**
 * Error card for chat tool parts. Shown when a tool call fails.
 */
export function PartErrorCard({ message, label = 'Tool failed' }: SharedErrorCardProps) {
  return (
    <Card
      as="section"
      role="alert"
      aria-label={message ? `${label}: ${message}` : label}
      className="border-danger/30 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <span className="bg-danger mt-0.5 size-1.5 shrink-0 rounded-full" aria-hidden="true" />
        <p className="text-danger min-w-0">
          <span className="font-semibold">{label}</span>
          {message ? <span className="text-fg-muted"> · {message}</span> : null}
        </p>
      </div>
    </Card>
  );
}
