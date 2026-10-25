'use client';

// SPDX-License-Identifier: Apache-2.0

// Action-plan tab: newest parsed plan or the empty-state copy.
import { IconListCheck } from '@tabler/icons-react';

import { PlanPart } from '../parts/plan';
import type { LatestPlan } from './use-latest-plan';

export function DockPlanPanel({ latestPlan }: { latestPlan: LatestPlan }) {
  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4">
      {latestPlan ? (
        <PlanPart plan={latestPlan} />
      ) : (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
          <IconListCheck className="text-fg-subtle size-8 stroke-1" />
          <p className="text-fg-muted text-sm font-medium">No Active Action Plan</p>
          <p className="text-fg-subtle max-w-xs text-xs">
            Run a Full Committee analysis to generate a step-by-step trade checklist, key price
            levels, and risk milestones here.
          </p>
        </div>
      )}
    </div>
  );
}
