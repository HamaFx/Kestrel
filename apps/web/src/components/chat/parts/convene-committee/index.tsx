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

// Bespoke renderer for the `convene_committee` tool part. The desk verdict
// card, persona labels, and placeholder states live in sibling files.

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
    bgTone = 'bg-bull/10 text-bull border-bull/30';
    icon = <IconCircleCheck className="mr-1 size-3.5" />;
  } else if (goNoGo === 'caution') {
    bgTone = 'bg-warn/10 text-warn border-warn/30';
    icon = <IconAlertTriangle className="mr-1 size-3.5" />;
  } else {
    bgTone = 'bg-bear/10 text-bear border-bear/30';
    icon = <IconCircleX className="mr-1 size-3.5" />;
  }

  return (
    <div
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 font-mono text-xs font-semibold uppercase ${bgTone}`}
    >
      {icon}
      Grade {grade}
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
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3.5 rounded-xl border p-4 shadow-sm">
      <header className="border-border/70 flex flex-col gap-2.5 border-b pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconUsers className="text-brand size-4" />
            <h3 className="text-fg text-sm font-semibold">
              Committee Review · {output.symbol} {output.side.toUpperCase()}
            </h3>
          </div>
          <GradeBadge grade={output.grade} goNoGo={output.goNoGo} />
        </div>

        {/* Execution Level Strip */}
        <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
          <div className="bg-bg-elev-2/70 border-border/60 rounded-lg border px-2.5 py-1.5">
            <span className="text-fg-subtle block text-xs">Entry</span>
            <strong className="text-fg">{output.entry}</strong>
          </div>
          <div className="bg-bg-elev-2/70 border-border/60 rounded-lg border px-2.5 py-1.5">
            <span className="text-fg-subtle block text-xs">Invalidation Stop</span>
            <strong className="text-bear">{output.stop ?? '—'}</strong>
          </div>
          <div className="bg-bg-elev-2/70 border-border/60 rounded-lg border px-2.5 py-1.5">
            <span className="text-fg-subtle block text-xs">Primary Target</span>
            <strong className="text-bull">{output.target ?? '—'}</strong>
          </div>
        </div>
      </header>

      {/* Consensus Executive Summary First */}
      <div className="border-border/80 bg-bg-elev-2/60 rounded-lg border p-3">
        <div className="text-fg-subtle mb-1 font-mono text-xs font-semibold uppercase">
          Committee Synthesis
        </div>
        <p className="text-fg text-sm leading-relaxed">{output.consensus}</p>
      </div>

      {/* Individual Desk Verdicts */}
      <div className="flex flex-col gap-2">
        {output.verdicts.map((v) => (
          <VerdictCard key={v.persona} verdict={v} />
        ))}
      </div>
    </div>
  );
}
