// SPDX-License-Identifier: Apache-2.0

// Checklist state for the pre-session gameplan drawer: drawer visibility,
// today's persisted plan, the ritual form fields, and the lock-in mutation.
//
// The plan is persisted to `user_settings.session_gameplan` through a server
// action; the server render seeds `initialPlan` so the drawer works before any
// client fetch.
import type { SessionGameplan } from '@kestrel/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import { saveSessionGameplanAction } from '../../_actions/session-gameplan';
import { PRESET_RULES } from './session-plan';

function isToday(plan: SessionGameplan | null): boolean {
  return plan?.date === new Date().toISOString().slice(0, 10);
}

export function useSessionGameplan(initialPlan: SessionGameplan | null = null) {
  const stored = isToday(initialPlan) ? initialPlan : null;
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<SessionGameplan | null>(stored);
  const [saving, setSaving] = useState(false);

  // Form states (seeded from the active plan so a reload keeps today's inputs)
  const [newsReviewed, setNewsReviewed] = useState(stored?.newsReviewed ?? false);
  const [strategyAligned, setStrategyAligned] = useState(stored?.strategyAligned ?? false);
  const [maxDailyR, setMaxDailyR] = useState(stored?.maxDailyR ?? 2.0);
  const [mindset, setMindset] = useState(stored?.mindset ?? 'focused');
  const [primaryRule, setPrimaryRule] = useState<string>(
    stored?.primaryRule ??
      PRESET_RULES[0] ??
      'Strict 1:2 minimum Risk-to-Reward on every execution',
  );
  const [customRule, setCustomRule] = useState('');

  async function handleSavePlan() {
    if (!newsReviewed || !strategyAligned) {
      toast.error('Please acknowledge the news clearance and strategy commitment checks.');
      return;
    }

    const newPlan: SessionGameplan = {
      date: new Date().toISOString().slice(0, 10),
      maxDailyR,
      mindset,
      primaryRule:
        customRule.trim() || primaryRule || (PRESET_RULES[0] ?? 'Strict Risk Management'),
      newsReviewed,
      strategyAligned,
      completedAt: Date.now(),
    };

    setSaving(true);
    try {
      const result = await saveSessionGameplanAction(newPlan);
      if (!result.ok) throw new Error(result.error);
      setPlan(result.plan);
      setOpen(false);
      toast.success('Pre-session gameplan locked in! Trade with discipline today.');
    } catch (err) {
      toast.error('Failed to save session plan', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  function selectPresetRule(rule: string) {
    setPrimaryRule(rule);
    setCustomRule('');
  }

  return {
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
  };
}
