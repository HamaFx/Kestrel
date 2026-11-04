'use client';

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

// Pre-session gameplan drawer shell: trigger button, header, the four ritual
// steps, and the lock-in action.
import type { JournalEntry, SessionGameplan } from '@kestrel/shared';
import { IconListCheck, IconShieldCheck } from '@tabler/icons-react';
import { m } from 'motion/react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { IconBadge } from '@/components/ui/icon-badge';
import { cn } from '@/lib/formatters/cn';

import { MindsetSection } from './mindset-section';
import { ProtocolVerificationSection } from './protocol-verification-section';
import { RiskBudgetSection } from './risk-budget-section';
import { SessionRuleSection } from './session-rule-section';
import { useSessionGameplan } from './use-session-gameplan';

export function PreSessionChecklistDrawer({
  initialPlan = null,
  entries = [],
}: {
  initialPlan?: SessionGameplan | null;
  entries?: readonly JournalEntry[];
}) {
  const [usedDailyR, setUsedDailyR] = useState(0);

  useEffect(() => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const used = entries
      .filter(
        (entry) =>
          entry.outcome !== 'open' &&
          entry.rMultiple !== null &&
          entry.closedAt !== null &&
          entry.closedAt >= startMs,
      )
      .reduce((sum, entry) => sum + (entry.rMultiple ?? 0), 0);
    setUsedDailyR(used);
  }, [entries]);

  const {
    open,
    setOpen,
    plan,
    saving,
    newsReviewed,
    setNewsReviewed,
    strategyAligned,
    setStrategyAligned,
    maxDailyR,
    setMaxDailyR,
    mindset,
    setMindset,
    primaryRule,
    customRule,
    selectPresetRule,
    handleSavePlan,
  } = useSessionGameplan(initialPlan);

  const isCompleted = !!plan;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={cn(
            'tactile-press inline-flex h-10 items-center gap-1.5 rounded-md border px-3 font-mono text-xs font-semibold transition-all select-none',
            isCompleted
              ? 'border-brand/50 bg-brand/12 text-brand hover:bg-brand/20 shadow-[0_0_12px_rgba(255,54,22,0.18),inset_0_1px_0_rgba(255,255,255,0.12)]'
              : 'surface-button text-fg border-white/[0.09] hover:border-white/[0.18] hover:brightness-110',
          )}
          title={isCompleted ? 'Session Gameplan is Active' : 'Start Pre-Session Checklist'}
        >
          {isCompleted ? (
            <>
              <IconShieldCheck className="text-brand size-4" strokeWidth={1.85} />
              <span>Gameplan: {plan.maxDailyR}R Max</span>
            </>
          ) : (
            <>
              <IconListCheck className="text-brand size-4" strokeWidth={1.85} />
              <span>Pre-Session Checklist</span>
            </>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[92vh] overflow-y-auto">
        <DrawerHeader>
          <div className="flex items-center gap-3">
            <IconBadge tone="brand" size="md" reticle>
              <IconListCheck className="size-5" strokeWidth={1.85} />
            </IconBadge>
            <div>
              <DrawerTitle>Pre-Session Gameplan &amp; Discipline Ritual</DrawerTitle>
              <DrawerDescription>
                Lock in your session parameters before touching the charts to prevent FOMO and
                emotional overtrading.
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-6"
        >
          <MindsetSection mindset={mindset} onSelect={setMindset} />

          <RiskBudgetSection
            maxDailyR={maxDailyR}
            usedDailyR={usedDailyR}
            onSelect={setMaxDailyR}
          />

          <SessionRuleSection
            primaryRule={primaryRule}
            customRule={customRule}
            onSelect={selectPresetRule}
          />

          <ProtocolVerificationSection
            newsReviewed={newsReviewed}
            strategyAligned={strategyAligned}
            maxDailyR={maxDailyR}
            onNewsReviewedChange={setNewsReviewed}
            onStrategyAlignedChange={setStrategyAligned}
          />

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <DrawerClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              variant="primary"
              size="md"
              onClick={handleSavePlan}
              loading={saving}
              disabled={saving}
              className="gap-2 font-semibold"
            >
              <IconShieldCheck className="size-4" strokeWidth={1.85} />
              Lock In Daily Gameplan
            </Button>
          </div>
        </m.div>
      </DrawerContent>
    </Drawer>
  );
}
