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

// 3×3 ember LED matrix for live agent execution. Nine brand-coloured cells
// with non-linear staggered cadence so the array shimmers like an active
// hardware compute core; the reduced-motion branch renders them static.
import { cn } from '@/lib/formatters/cn';

const LED_CELLS = [
  { delayMs: 0, durationMs: 920 },
  { delayMs: 280, durationMs: 1040 },
  { delayMs: 540, durationMs: 880 },
  { delayMs: 160, durationMs: 1100 },
  { delayMs: 420, durationMs: 840 },
  { delayMs: 680, durationMs: 980 },
  { delayMs: 600, durationMs: 940 },
  { delayMs: 220, durationMs: 1080 },
  { delayMs: 760, durationMs: 900 },
] as const;

export function EmberLedMatrix({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-3.5 grid-cols-3 grid-rows-3 place-items-center gap-[1.5px]',
        className,
      )}
    >
      {LED_CELLS.map((cell, index) => (
        <span
          key={index}
          style={{
            animationDelay: `${cell.delayMs}ms`,
            animationDuration: `${cell.durationMs}ms`,
          }}
          className="bg-brand size-[3px] animate-pulse rounded-[0.5px] shadow-[0_0_4px_rgba(255,54,22,0.85)] motion-reduce:animate-none"
        />
      ))}
    </span>
  );
}
