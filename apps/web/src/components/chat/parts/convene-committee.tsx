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

import type { CommitteeVerdict, ConveneCommitteeOutput } from '@kestrel/shared';
import {
  IconAlertTriangle,
  IconBriefcase,
  IconChevronDown,
  IconCircleCheck,
  IconCircleX,
  IconRadar,
  IconTrendingUp,
  IconUsers,
  IconLink as LinkIcon,
  type Icon,
} from '@tabler/icons-react';

import type { ToolPartProps } from './registry';

const PERSONA_LABELS: Record<string, { label: string; Icon: Icon }> = {
  economist: { label: 'Macro & Rates Desk', Icon: IconBriefcase },
  technician: { label: 'Technical Structure Desk', Icon: IconTrendingUp },
  risk_manager: { label: 'Risk & Sizing Desk', Icon: IconAlertTriangle },
  sentiment: { label: 'Flow & Sentiment Desk', Icon: IconRadar },
};

function GradeBadge({
  grade,
  goNoGo,
}: {
  grade: ConveneCommitteeOutput['grade'];
  goNoGo: ConveneCommitteeOutput['goNoGo'];
}) {
  let bgTone = 'bg-bg-elev-2 text-fg-muted border-border';
  let icon = null;

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

function VerdictCard({ verdict }: { verdict: CommitteeVerdict }) {
  const meta = PERSONA_LABELS[verdict.persona] ?? {
    label: verdict.persona,
    Icon: IconUsers,
  };
  const Icon = meta.Icon;

  const tone =
    verdict.verdict === 'bullish'
      ? 'text-bull'
      : verdict.verdict === 'bearish'
        ? 'text-bear'
        : 'text-fg-muted';

  return (
    <details className="border-border/80 bg-bg-elev-2/40 group rounded-lg border [&_summary::-webkit-details-marker]:hidden">
      <summary className="focus-visible:ring-fg flex cursor-pointer items-center justify-between rounded-lg p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset">
        <div className="flex items-center gap-2">
          <Icon className="text-fg-subtle size-4" />
          <span className="text-fg text-xs font-semibold">{meta.label}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`font-mono text-xs font-semibold uppercase ${tone}`}>
            {verdict.verdict}
          </span>
          <span className="bg-bg-elev-1 border-border text-fg-subtle rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums">
            {verdict.confidence}/10
          </span>
          <IconChevronDown className="text-fg-subtle size-3.5 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="px-3 pt-0 pb-3 text-xs">
        <div className="border-border/60 mt-1 space-y-2 border-t pt-2.5">
          {verdict.keyPoints.length > 0 && (
            <div>
              <span className="text-fg-muted font-semibold">Key Points:</span>
              <ul className="text-fg mt-1 list-disc space-y-1 pl-4 leading-relaxed">
                {verdict.keyPoints.map((kp, i) => (
                  <li key={i}>{kp}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
            <div className="bg-bg-elev-1/60 border-border/60 rounded-md border p-2">
              <span className="text-fg-subtle block font-semibold">Primary Risk</span>
              <span className="text-fg mt-0.5 block leading-relaxed">{verdict.risk}</span>
            </div>
            <div className="bg-bg-elev-1/60 border-border/60 rounded-md border p-2">
              <span className="text-fg-subtle block font-semibold">Desk Recommendation</span>
              <span className="text-fg mt-0.5 block leading-relaxed">{verdict.recommendation}</span>
            </div>
          </div>

          {verdict.sources && verdict.sources.length > 0 && (
            <div className="pt-1">
              <span className="text-fg-muted flex items-center gap-1 font-semibold">
                <LinkIcon className="size-3" /> Sources:
              </span>
              <ul className="mt-1 flex flex-wrap gap-2">
                {verdict.sources.map((src, i) => {
                  let host = src;
                  let isUrl = false;
                  let href = src;
                  try {
                    if (/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[\w- ./?%&=]*)?$/i.test(src)) {
                      isUrl = true;
                      if (!/^https?:\/\//i.test(src)) {
                        href = 'https://' + src;
                      }
                      host = new URL(href).hostname.replace('www.', '');
                    }
                  } catch {
                    isUrl = false;
                  }
                  return (
                    <li key={i}>
                      {isUrl ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-fg inline-block max-w-[200px] truncate align-bottom text-xs hover:underline"
                        >
                          {host}
                        </a>
                      ) : (
                        <span className="text-fg-subtle text-xs">{src}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-xl border p-4"
      aria-busy="true"
      aria-label="Convening committee"
    >
      <div className="flex items-center justify-between">
        <div className="bg-bg-elev-2 h-5 w-1/3 animate-pulse rounded-sm" />
        <div className="bg-bg-elev-2 h-5 w-16 animate-pulse rounded-sm" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-bg-elev-2 h-10 animate-pulse rounded-md" />
        <div className="bg-bg-elev-2 h-10 animate-pulse rounded-md" />
        <div className="bg-bg-elev-2 h-10 animate-pulse rounded-md" />
      </div>
      <div className="bg-bg-elev-2 h-14 animate-pulse rounded-md" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-xl border p-3.5 text-xs"
    >
      Committee convening failed{message ? ` · ${message}` : ''}
    </div>
  );
}
