'use client';

// SPDX-License-Identifier: Apache-2.0

// Action-plan tab: newest parsed plan or the empty-state copy.
import { IconListCheck } from '@tabler/icons-react';

import { PlanPart } from '../parts/plan';
import type { LatestPlan } from './use-latest-plan';

export function DockPlanPanel({ latestPlan }: { latestPlan: LatestPlan }) {
  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4">
      <div className="mb-3.5 flex items-center justify-between border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-brand animate-pulse" />
          <span className="font-mono text-[10px] font-semibold tracking-wider text-brand uppercase">
            SYNTHESIS EXECUTION PLAN
          </span>
        </div>
        <span className="font-mono text-[10px] text-fg-subtle uppercase">ARBITER PROTOCOL</span>
      </div>

      {latestPlan ? (
        <PlanPart plan={latestPlan} />
      ) : (
        <div className="surface-card flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-border/40 bg-bg-elev-1 p-6 text-center shadow-sm">
          <IconListCheck className="size-8 stroke-1 text-brand" />
          <p className="font-display text-sm font-normal text-fg">No Active Action Plan</p>
          <p className="max-w-xs font-serif text-xs italic text-fg-muted">
            Run a Full Committee review to generate a step-by-step trade checklist, key price levels, and risk milestones here.
          </p>
        </div>
      )}
    </div>
  );
}
