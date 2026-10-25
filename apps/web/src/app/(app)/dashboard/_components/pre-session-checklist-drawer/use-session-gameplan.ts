// SPDX-License-Identifier: Apache-2.0

// Checklist state for the pre-session gameplan drawer: drawer visibility,
// today's persisted plan, the ritual form fields, and the lock-in mutation.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { getTodayKey, PRESET_RULES, type SessionPlan } from './session-plan';

export function useSessionGameplan() {
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

  function selectPresetRule(rule: string) {
    setPrimaryRule(rule);
    setCustomRule('');
  }

  return {
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
  };
}
