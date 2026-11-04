'use client';

// SPDX-License-Identifier: Apache-2.0

// Error budget gauge — how much error budget remains.
import { IconMinus } from '@tabler/icons-react';

import { RingGauge } from '@/components/ui/ring-gauge';

/**
 * Error budget gauge — shows how much error budget remains.
 * Green (>50%), Yellow (10-50%), Red (<10% or exhausted).
 */
export function ErrorBudgetGauge({ budget }: { budget: number | null }) {
  if (budget === null) {
    return (
      <span className="text-fg-subtle text-xs" aria-label="No data available">
        <IconMinus className="inline size-3" aria-hidden="true" /> N/A
      </span>
    );
  }

  const pct = Math.round(budget * 100);
  const tone = pct > 50 ? 'success' : pct > 10 ? 'warn' : 'danger';

  return <RingGauge value={pct} tone={tone} size={56} label="error budget" showLabel={false} />;
}
