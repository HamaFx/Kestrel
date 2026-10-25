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
import { IconListCheck, IconShieldCheck } from '@tabler/icons-react';

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
import { cn } from '@/lib/formatters/cn';

import { MindsetSection } from './mindset-section';
import { ProtocolVerificationSection } from './protocol-verification-section';
import { RiskBudgetSection } from './risk-budget-section';
import { SessionRuleSection } from './session-rule-section';
import { useSessionGameplan } from './use-session-gameplan';

export function PreSessionChecklistDrawer() {
  const {
    open,
    setOpen,
    plan,
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
  } = useSessionGameplan();

  const isCompleted = !!plan;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold transition-all active:translate-y-[0.5px]',
            isCompleted
              ? 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/20 shadow-[0_0_8px_rgba(255,54,22,0.15)]'
              : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg hover:border-border-hover',
          )}
          title={isCompleted ? 'Session Gameplan is Active' : 'Start Pre-Session Checklist'}
        >
          {isCompleted ? (
            <>
              <IconShieldCheck className="text-brand size-3.5" />
              <span>Gameplan: {plan.maxDailyR}R Max</span>
            </>
          ) : (
            <>
              <IconListCheck className="text-fg-subtle size-3.5" />
              <span>Pre-Session Checklist</span>
            </>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[92vh] overflow-y-auto">
        <DrawerHeader>
          <div className="flex items-center gap-2">
            <div className="bg-brand/10 border-brand/30 text-brand flex size-8 items-center justify-center rounded-lg border">
              <IconListCheck className="size-5" />
            </div>
            <div>
              <DrawerTitle>Pre-Session Gameplan & Discipline Ritual</DrawerTitle>
              <DrawerDescription>
                Lock in your session parameters before touching the charts to prevent FOMO and
                emotional overtrading.
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-6">
          <MindsetSection mindset={mindset} onSelect={setMindset} />

          <RiskBudgetSection maxDailyR={maxDailyR} onSelect={setMaxDailyR} />

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
              className="gap-2 font-semibold"
            >
              <IconShieldCheck className="size-4" />
              Lock In Daily Gameplan
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
