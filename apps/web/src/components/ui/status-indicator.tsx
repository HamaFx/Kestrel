// SPDX-License-Identifier: Apache-2.0

// Six-tone status indicator for session, agent and service state. The dot
// pulses only when the state is live or deliberating, and the reduced-motion
// branch keeps it static.
import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

export type StatusTone = 'online' | 'stale' | 'deliberating' | 'danger' | 'offline' | 'neutral';

const TONE_CLASS: Record<StatusTone, string> = {
  online: 'bg-bull',
  stale: 'bg-warn',
  deliberating: 'bg-brand',
  danger: 'bg-danger',
  offline: 'bg-fg-subtle/40',
  neutral: 'bg-fg-muted',
};

const PULSE_TONES: ReadonlySet<StatusTone> = new Set(['online', 'deliberating']);

export function StatusIndicator({
  tone,
  label,
  children,
  className,
}: {
  tone: StatusTone;
  /** Accessible name; not rendered. */
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          TONE_CLASS[tone],
          PULSE_TONES.has(tone) && 'motion-safe:animate-pulse',
        )}
      />
      {children}
    </span>
  );
}
