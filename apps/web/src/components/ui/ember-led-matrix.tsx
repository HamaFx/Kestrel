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
// with staggered pulses; the reduced-motion branch renders them static.
import { cn } from '@/lib/formatters/cn';

const LED_DELAYS_MS = [0, 120, 240, 80, 200, 320, 160, 280, 400];

export function EmberLedMatrix({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-3.5 grid-cols-3 grid-rows-3 place-items-center gap-[1.5px]',
        className,
      )}
    >
      {LED_DELAYS_MS.map((delay, index) => (
        <span
          key={index}
          style={{ animationDelay: `${delay}ms` }}
          className="bg-brand size-[3px] animate-pulse rounded-[0.5px] shadow-[0_0_4px_rgba(255,54,22,0.85)] motion-reduce:animate-none"
        />
      ))}
    </span>
  );
}
