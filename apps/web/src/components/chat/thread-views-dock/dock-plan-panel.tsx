'use client';

// SPDX-License-Identifier: Apache-2.0

// Action-plan tab: newest parsed plan or the empty-state copy.
import { IconListCheck } from '@tabler/icons-react';

import { PlanPart } from '../parts/plan';
import type { LatestPlan } from './use-latest-plan';

export function DockPlanPanel({ latestPlan }: { latestPlan: LatestPlan }) {
  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4">
      <div className="border-border/40 mb-3.5 flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full" />
          <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
            SYNTHESIS EXECUTION PLAN
          </span>
        </div>
        <span className="text-fg-subtle font-mono text-[10px] uppercase">ARBITER PROTOCOL</span>
      </div>

      {latestPlan ? (
        <PlanPart plan={latestPlan} />
      ) : (
        <div className="surface-card border-border/40 bg-bg-elev-1 flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center shadow-sm">
          <IconListCheck className="text-brand size-8 stroke-1" />
          <p className="font-display text-fg text-sm font-normal">No Active Action Plan</p>
          <p className="text-fg-muted max-w-xs font-serif text-xs italic">
            Run a Full Committee review to generate a step-by-step trade checklist, key price
            levels, and risk milestones here.
          </p>
        </div>
      )}
    </div>
  );
}
