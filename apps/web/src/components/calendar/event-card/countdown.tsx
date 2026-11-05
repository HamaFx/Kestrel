'use client';

// SPDX-License-Identifier: Apache-2.0

// Relative countdown label for future events (or "Live now" once released).
import { formatCountdown } from '@/lib/formatters/datetime';
import { cn } from '@/lib/formatters/cn';

export function Countdown({ ms, imminent }: { ms: number; imminent: boolean }) {
  return (
    <span
      className={cn('font-semibold', ms <= 0 ? 'text-danger' : imminent ? 'text-warn' : 'text-fg')}
    >
      {formatCountdown(ms)}
    </span>
  );
}
