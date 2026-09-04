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
import type { CoachInsightsResult } from '@kestrel/ai';
import type { JournalStats } from '@kestrel/shared';
import {
  IconAlertTriangle,
  IconBrain,
  IconCircleCheck,
  IconFlame,
  IconShieldCheck,
  IconSparkles,
} from '@tabler/icons-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

interface AiCoachCardProps {
  stats: JournalStats;
}

export function AiCoachCard({ stats }: AiCoachCardProps) {
  const [insights, setInsights] = useState<CoachInsightsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateCoachReport() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchCsrf('/api/journal/coach-insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });

      const body = (await res.json()) as {
        error?: { message: string };
        insights?: CoachInsightsResult;
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }

      if (body.insights) {
        setInsights(body.insights);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate coach insights');
    } finally {
      setLoading(false);
    }
  }

  const gradeColors: Record<string, string> = {
    'A+': 'bg-bull/10 text-bull border-bull/20',
    A: 'bg-bull/10 text-bull border-bull/20',
    B: 'bg-info/10 text-info border-info/20',
    C: 'bg-warn/10 text-warn border-warn/20',
    D: 'bg-warn/10 text-warn border-warn/20',
    F: 'bg-bear/10 text-bear border-bear/20',
  };

  return (
    <div className="border-border/80 bg-bg-elev-1 surface-chip flex flex-col gap-5 rounded-xl border border-edge/80 p-5 shadow-[var(--shadow-chip)]">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand/10 text-brand surface-chip rounded-xl p-2.5 border border-brand/20 shadow-xs">
            <IconBrain className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-fg font-display text-base font-normal tracking-tight">
                Trading Performance & Habit Review
              </h3>
              <span className="bg-brand/10 text-brand border border-brand/30 text-caption rounded-md px-1.5 py-0.5 font-bold uppercase font-mono">
                Coach v2
              </span>
            </div>
            <p className="text-fg-subtle font-sans text-xs">
              Behavioral insights, risk review & execution audit
            </p>
          </div>
        </div>

        <Button
          onClick={generateCoachReport}
          disabled={loading || stats.count === 0}
          size="sm"
          variant="tactical"
          className="cursor-pointer font-medium"
        >
          <IconSparkles className={cn('mr-1.5 size-3.5', loading && 'animate-spin')} />
          <span>
            {loading ? 'Analyzing Habits...' : insights ? 'Refresh Insights' : 'Run Trade Audit'}
          </span>
        </Button>
      </div>

      {/* Empty / Initial State */}
      {!insights && !loading && !error && (
        <div className="border-border/60 surface-well bg-[#121212] flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center">
          <IconBrain className="text-fg-subtle size-8 opacity-60" />
          <p className="text-fg text-xs font-semibold font-sans">
            Ready to analyze your trading psychology and edge
          </p>
          <p className="text-fg-subtle text-caption max-w-md font-sans">
            The AI coach cross-analyzes win rate across sessions (London/NY/Asian), hold times, risk
            multiples, and trade notes to detect recurring mistakes.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="border border-danger/30 bg-danger/5 text-danger flex items-center gap-2 rounded-xl p-3 text-xs font-mono">
          <IconAlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Insights Content */}
      {insights && (
        <div className="animate-in fade-in flex flex-col gap-4 duration-300">
          {/* Executive Row */}
          <div className="surface-panel border border-white/10 bg-[#161718] flex flex-col items-start justify-between gap-4 rounded-xl p-5 shadow-sm sm:flex-row sm:items-center">
            <div className="flex flex-col gap-1">
              <span className="text-brand text-caption font-mono font-bold tracking-wider uppercase">
                Coach Assessment & Edge
              </span>
              <p className="text-fg text-xs font-sans leading-relaxed">{insights.summary}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-fg-subtle text-caption font-mono font-semibold uppercase">
                  Discipline Score
                </span>
                <span className="text-fg-subtle text-caption font-mono">{insights.modelId}</span>
              </div>
              <div
                className={cn(
                  'flex size-12 items-center justify-center rounded-xl border text-xl font-black shadow-lg',
                  gradeColors[insights.disciplineGrade] ?? gradeColors.B,
                )}
              >
                {insights.disciplineGrade}
              </div>
            </div>
          </div>

          {/* Strengths & Leaks 2-Column Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Strengths */}
            <div className="surface-chip border border-bull/20 bg-bull/[0.03] flex flex-col gap-2.5 rounded-xl p-4 shadow-sm">
              <div className="text-bull flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider uppercase">
                <IconShieldCheck className="size-4" />
                <span>Identified Edges & Strengths</span>
              </div>
              <ul className="flex flex-col gap-2 font-sans">
                {insights.strengths.map((str, i) => (
                  <li key={i} className="text-fg-muted flex items-start gap-2 text-xs">
                    <IconCircleCheck className="text-bull mt-0.5 size-3.5 shrink-0" />
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Leaks */}
            <div className="surface-chip border border-bear/20 bg-bear/[0.03] flex flex-col gap-2.5 rounded-xl p-4 shadow-sm">
              <div className="text-bear flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider uppercase">
                <IconAlertTriangle className="size-4" />
                <span>Psychological & Execution Leaks</span>
              </div>
              <ul className="flex flex-col gap-2 font-sans">
                {insights.leaks.map((leak, i) => (
                  <li key={i} className="text-fg-muted flex items-start gap-2 text-xs">
                    <IconFlame className="text-bear mt-0.5 size-3.5 shrink-0" />
                    <span>{leak}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Rules */}
          <div className="surface-panel border border-white/10 bg-[#141516] flex flex-col gap-3 rounded-xl p-4.5 shadow-sm">
            <h4 className="text-fg text-caption font-mono font-bold tracking-wider uppercase sm:text-xs">
              Action Plan: 3 Key Rules For Your Next Trading Session
            </h4>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {insights.actionRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="surface-well bg-black/50 border border-white/10 flex items-start gap-2.5 rounded-lg p-3"
                >
                  <span className="bg-brand/10 text-brand text-caption flex size-5 shrink-0 items-center justify-center rounded-full font-mono font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-fg text-xs leading-relaxed font-medium">{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
