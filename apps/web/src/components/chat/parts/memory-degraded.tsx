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

import type { MemoryDegradedPart } from '@kestrel/shared';
import { IconDatabaseOff } from '@tabler/icons-react';

import { cn } from '@/lib/cn';

/**
 * Inline notice shown when a turn answered without loading earlier thread memory.
 */
export function MemoryDegradedPartView({ part: _part }: { part: MemoryDegradedPart }) {
  return (
    <div
      className={cn(
        'border-chip-edge bg-background/40 text-fg-muted text-caption flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono',
      )}
      role="note"
      aria-label="Conversation history notice"
    >
      <IconDatabaseOff className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>
        Earlier conversation history couldn&apos;t be loaded for this reply, so this analysis is
        based on your current message.
      </span>
    </div>
  );
}
