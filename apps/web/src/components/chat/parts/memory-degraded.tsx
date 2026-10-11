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

import { IconDatabaseOff } from '@tabler/icons-react';

import type { MemoryDegradedPart } from '@kestrel/shared';

import { cn } from '@/lib/cn';

/**
 * Audit plan §1.5 — inline notice shown when a turn had to fall back from
 * native (semantic-recall) memory to explicit history. Purely informational:
 * the answer itself completed normally.
 */
export function MemoryDegradedPartView({ part }: { part: MemoryDegradedPart }) {
  return (
    <div
      className={cn(
        'border-chip-edge bg-background/40 text-fg-muted flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-caption',
      )}
      role="note"
      aria-label="Memory degraded notice"
    >
      <IconDatabaseOff className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>
        Thread memory was unavailable for this answer — semantic recall was off.{' '}
        <span className="text-fg-subtle">{part.reason}</span>
      </span>
    </div>
  );
}
