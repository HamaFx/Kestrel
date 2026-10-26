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

// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `convene_committee` tool part. Option 3A multi-desk
// parallel matrix + Arbiter synthesis verdict.

import type { ConveneCommitteeOutput } from '@kestrel/shared';
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconUsers } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import type { ToolPartProps } from '../registry';
import { ErrorCard, SkeletonCard } from './convene-states';
import { VerdictCard } from './verdict-card';

function GradeBadge({
  grade,
  goNoGo,
}: {
  grade: ConveneCommitteeOutput['grade'];
  goNoGo: ConveneCommitteeOutput['goNoGo'];
}) {
  let bgTone: string;
  let icon: ReactNode;

  if (goNoGo === 'go') {
    bgTone = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    icon = <IconCircleCheck className="mr-1 size-3.5" />;
  } else if (goNoGo === 'caution') {
    bgTone = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    icon = <IconAlertTriangle className="mr-1 size-3.5" />;
  } else {
    bgTone = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    icon = <IconCircleX className="mr-1 size-3.5" />;
  }

  return (
    <div
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 font-mono text-xs font-semibold uppercase ${bgTone}`}
    >
      {icon}
      Grade {grade} · {goNoGo.toUpperCase()}
    </div>
  );
}

export function ConveneCommitteePart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'convene_committee'>) {
  if (state === 'error') {
    return <ErrorCard message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  return (
    <div className="surface-card flex flex-col gap-4 rounded-xl border border-border/40 bg-bg-elev-1 p-4 shadow-md sm:p-5">
      {/* ── Committee Matrix Header ── */}
      <header className="flex flex-col gap-2 border-b border-border/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <IconUsers className="size-4 text-brand" />
          <div>
            <span className="font-mono text-[10px] tracking-wider text-brand uppercase">
              COUNCIL DELIBERATION
            </span>
            <h3 className="font-display text-base font-normal text-fg">
              Committee Review · {output.symbol} {output.side.toUpperCase()}
            </h3>
          </div>
        </div>
        <GradeBadge grade={output.grade} goNoGo={output.goNoGo} />
      </header>

      {/* ── Parallel 2x2 Strategist Matrix ── */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {output.verdicts.map((v) => (
          <VerdictCard key={v.persona} verdict={v} />
        ))}
      </div>

      {/* ── Arbiter Synthesis Verdict Block (Bottom) ── */}
      <div className="rounded-xl border border-brand/40 bg-gradient-to-b from-bg-elev-2 to-bg-elev-1 p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-brand" />
            <span className="font-mono text-xs font-bold tracking-wider text-brand uppercase">
              STAGE II // ARBITER SYNTHESIS VERDICT
            </span>
          </div>
          <span className="font-mono text-[11px] text-fg-subtle">
            ALIGNMENT: {output.goNoGo === 'go' ? 'HIGH CONVICTION' : 'QUALIFIED'}
          </span>
        </div>

        <div className="mt-3">
          <h4 className="font-serif text-lg italic text-fg">
            Consensus Verdict: {output.goNoGo.toUpperCase()} (Grade {output.grade})
          </h4>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-muted sm:text-sm">
            {output.consensus}
          </p>
        </div>

        {/* Execution Levels */}
        <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
          <div className="rounded-lg border border-border/40 bg-bg-elev-2 px-3 py-2">
            <span className="block text-[10px] text-fg-subtle uppercase">Entry Anchor</span>
            <strong className="text-sm font-semibold text-fg">{output.entry}</strong>
          </div>
          <div className="rounded-lg border border-border/40 bg-bg-elev-2 px-3 py-2">
            <span className="block text-[10px] text-fg-subtle uppercase">Invalidation Stop</span>
            <strong className="text-sm font-semibold text-rose-400">{output.stop ?? '—'}</strong>
          </div>
          <div className="rounded-lg border border-border/40 bg-bg-elev-2 px-3 py-2">
            <span className="block text-[10px] text-fg-subtle uppercase">Primary Target</span>
            <strong className="text-sm font-semibold text-emerald-400">{output.target ?? '—'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
