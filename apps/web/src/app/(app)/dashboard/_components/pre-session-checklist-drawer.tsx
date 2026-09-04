// SPDX-License-Identifier: Apache-2.0

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
import {
  IconAlertTriangle,
  IconBrain,
  IconCheck,
  IconHeartbeat,
  IconListCheck,
  IconScale,
  IconShieldCheck,
  IconSparkles,
  IconTarget,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { cn } from '@/lib/cn';

interface SessionPlan {
  date: string;
  maxDailyR: number;
  mindset: string;
  primaryRule: string;
  newsReviewed: boolean;
  strategyAligned: boolean;
  completedAt: number;
}

const STORAGE_KEY_PREFIX = 'kestrel:session-gameplan:';

function getTodayKey(): string {
  const d = new Date();
  return `${STORAGE_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MINDSET_OPTIONS = [
  { id: 'calm', label: 'Calm & Patient', icon: IconBrain, desc: 'Ready to wait for A+ setups' },
  { id: 'focused', label: 'Sharp & Focused', icon: IconTarget, desc: '100% focused on execution' },
  {
    id: 'neutral',
    label: 'Neutral & Objective',
    icon: IconScale,
    desc: 'Unbiased market observation',
  },
  {
    id: 'fatigued',
    label: 'Tired / Distracted',
    icon: IconAlertTriangle,
    desc: 'Recommend half-risk only',
  },
];

const PRESET_RULES = [
  'Wait for 15M candle close confirmation before entering',
  'Strict 1:2 minimum Risk-to-Reward on every execution',
  'Zero trading during high-impact news releases',
  'Max 2 trades per session — quality over quantity',
  'Take profits at key liquidity levels; do not be greedy',
];

export function PreSessionChecklistDrawer() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<SessionPlan | null>(null);

  // Form states
  const [newsReviewed, setNewsReviewed] = useState(false);
  const [strategyAligned, setStrategyAligned] = useState(false);
  const [maxDailyR, setMaxDailyR] = useState(2.0);
  const [mindset, setMindset] = useState('focused');
  const [primaryRule, setPrimaryRule] = useState<string>(
    PRESET_RULES[0] ?? 'Strict 1:2 minimum Risk-to-Reward on every execution',
  );
  const [customRule, setCustomRule] = useState('');

  // Load today's plan on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTodayKey());
      if (raw) {
        const parsed = JSON.parse(raw) as SessionPlan;
        setPlan(parsed);
        setNewsReviewed(parsed.newsReviewed);
        setStrategyAligned(parsed.strategyAligned);
        setMaxDailyR(parsed.maxDailyR);
        setMindset(parsed.mindset);
        setPrimaryRule(parsed.primaryRule || PRESET_RULES[0] || '');
      }
    } catch {
      // ignore
    }
  }, []);

  function handleSavePlan() {
    if (!newsReviewed || !strategyAligned) {
      toast.error('Please acknowledge the news clearance and strategy commitment checks.');
      return;
    }

    const newPlan: SessionPlan = {
      date: new Date().toISOString().slice(0, 10),
      maxDailyR,
      mindset,
      primaryRule:
        customRule.trim() || primaryRule || (PRESET_RULES[0] ?? 'Strict Risk Management'),
      newsReviewed,
      strategyAligned,
      completedAt: Date.now(),
    };

    try {
      localStorage.setItem(getTodayKey(), JSON.stringify(newPlan));
      setPlan(newPlan);
      setOpen(false);
      toast.success('Pre-session gameplan locked in! Trade with discipline today.');
    } catch {
      toast.error('Failed to save session plan.');
    }
  }

  const isCompleted = !!plan;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono font-semibold transition-all active:translate-y-[0.5px]',
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
          {/* Step 1: Mindset Check */}
          <div className="flex flex-col gap-2">
            <span className="text-caption text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
              <IconHeartbeat className="text-brand size-3.5" />
              1. Emotional & Psychological State
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MINDSET_OPTIONS.map((opt) => {
                const active = mindset === opt.id;
                const OptIcon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMindset(opt.id)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all active:translate-y-[0.5px]',
                      active
                        ? 'border-brand bg-brand/10 text-fg ring-brand ring-1 shadow-[0_0_12px_rgba(255,54,22,0.15)]'
                        : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg hover:border-border-hover',
                    )}
                  >
                    <OptIcon className="text-brand size-5" />
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span className="text-fg-subtle text-caption leading-tight">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Risk Budget */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
                <IconShieldCheck className="text-danger size-3.5" />
                2. Max Daily Drawdown Budget
              </span>
              <span className="text-danger font-mono text-xs font-bold tabular-nums">
                -{maxDailyR.toFixed(1)}R Hard Stop
              </span>
            </div>
            <p className="text-fg-subtle text-xs">
              If cumulative realized losses reach this limit today, stop trading immediately.
            </p>
            <div className="flex flex-wrap gap-2">
              {[1.0, 1.5, 2.0, 2.5, 3.0].map((r) => {
                const active = maxDailyR === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setMaxDailyR(r)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-all active:translate-y-[0.5px]',
                      active
                        ? 'border-danger bg-danger/15 text-danger ring-danger font-bold ring-1'
                        : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg',
                    )}
                  >
                    {r.toFixed(1)}R Max
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Rule of the Session */}
          <div className="flex flex-col gap-2">
            <span className="text-caption text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
              <IconSparkles className="text-warn size-3.5" />
              3. Session Execution Focus Rule
            </span>
            <div className="flex flex-col gap-1.5">
              {PRESET_RULES.map((rule) => {
                const active = primaryRule === rule && !customRule;
                return (
                  <button
                    key={rule}
                    type="button"
                    onClick={() => {
                      setPrimaryRule(rule);
                      setCustomRule('');
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-all active:translate-y-[0.5px]',
                      active
                        ? 'border-brand bg-brand/10 text-fg ring-brand font-medium ring-1'
                        : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-3.5 shrink-0 items-center justify-center rounded-full border',
                        active ? 'border-brand bg-brand text-bg' : 'border-border',
                      )}
                    >
                      {active && <IconCheck className="size-2.5 stroke-[3]" />}
                    </div>
                    <span>{rule}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 4: Mandatory Acknowledgements */}
          <div className="surface-chip border border-white/10 flex flex-col gap-2.5 rounded-xl p-3.5 shadow-sm">
            <span className="text-caption text-fg-subtle font-semibold tracking-wider uppercase">
              4. Session Protocol Verification
            </span>

            <label className="text-fg flex cursor-pointer items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={newsReviewed}
                onChange={(e) => setNewsReviewed(e.target.checked)}
                className="border-border bg-bg-elev-2 text-brand focus:ring-brand accent-brand mt-0.5 size-4 cursor-pointer rounded-xs"
              />
              <span>
                <strong>Economic Calendar Checked</strong>: I have reviewed today's high-impact
                releases and will not enter reckless market orders before high-volatility events.
              </span>
            </label>

            <label className="text-fg flex cursor-pointer items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={strategyAligned}
                onChange={(e) => setStrategyAligned(e.target.checked)}
                className="border-border bg-bg-elev-2 text-brand focus:ring-brand accent-brand mt-0.5 size-4 cursor-pointer rounded-xs"
              />
              <span>
                <strong>Discipline Commitment</strong>: I will honor my stop losses, never
                revenge-trade, and shut down terminal if my {maxDailyR}R max drawdown is reached.
              </span>
            </label>
          </div>

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
