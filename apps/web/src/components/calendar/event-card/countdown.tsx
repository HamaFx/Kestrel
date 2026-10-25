'use client';

// SPDX-License-Identifier: Apache-2.0

// Relative countdown label for future events (or "Live now" once released).
import { cn } from '@/lib/formatters/cn';

export function Countdown({ ms, imminent }: { ms: number; imminent: boolean }) {
  if (ms <= 0) return <span className="text-danger font-semibold">Live now</span>;
  const d = Math.floor(ms / (24 * 60 * 60_000));
  const h = Math.floor((ms % (24 * 60 * 60_000)) / (60 * 60_000));
  const m = Math.floor((ms % (60 * 60_000)) / 60_000);
  const text = d > 0 ? `in ${d}d ${h}h` : h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  return <span className={cn('font-semibold', imminent ? 'text-warn' : 'text-fg')}>{text}</span>;
}
