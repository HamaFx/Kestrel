'use client';

// SPDX-License-Identifier: Apache-2.0

// Action-plan tab: the expanded Arbiter seal for the active certified dossier,
// followed by the newest parsed action plan or the empty-state copy.
import { IconListCheck } from '@tabler/icons-react';

import type { ExtractedTradeLevels } from '../parts/syndicate-dossier/extract-trade-levels';
import { ArbiterSealSizer } from '../parts/syndicate-dossier/arbiter-seal-sizer';
import { PlanPart } from '../parts/plan';
import type { LatestPlan } from './use-latest-plan';

export function DockPlanPanel({
  latestPlan,
  symbol,
  planId,
  levels,
}: {
  latestPlan: LatestPlan;
  symbol: string | null;
  planId: string;
  levels: ExtractedTradeLevels | null;
}) {
  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4">
      <div className="border-border/40 mb-3.5 flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 rounded-full" />
          <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
            SYNTHESIS EXECUTION PLAN
          </span>
        </div>
        <span className="text-fg-subtle font-mono text-[10px] uppercase">ARBITER PROTOCOL</span>
      </div>

      {levels ? (
        <div className="mb-4">
          <ArbiterSealSizer symbol={symbol} planId={planId} levels={levels} defaultOpen />
        </div>
      ) : null}

      {latestPlan ? (
        <PlanPart plan={latestPlan} />
      ) : (
        <div className="surface-card border-border/40 bg-bg-elev-1 flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center shadow-sm">
          <IconListCheck className="text-brand size-8 stroke-1" />
          <p className="font-display text-fg text-sm font-normal">No Active Action Plan</p>
          <p className="text-fg-muted max-w-xs font-sans text-xs leading-relaxed">
            Run a Convene Council review to generate a step-by-step trade checklist, key price
            levels, and risk milestones here.
          </p>
        </div>
      )}
    </div>
  );
}
