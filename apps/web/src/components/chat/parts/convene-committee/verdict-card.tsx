// SPDX-License-Identifier: Apache-2.0

// Per-desk verdict card for the convene_committee renderer.

import type { CommitteeVerdict } from '@kestrel/shared';
import { IconChevronDown, IconUsers, IconLink as LinkIcon } from '@tabler/icons-react';

import { PERSONA_LABELS } from './persona-labels';

export function VerdictCard({ verdict }: { verdict: CommitteeVerdict }) {
  const meta = PERSONA_LABELS[verdict.persona] ?? {
    label: verdict.persona,
    code: 'DESK // SPECIALIST',
    epithet: 'Independent Lens',
    Icon: IconUsers,
  };
  const Icon = meta.Icon;

  const isBull = verdict.verdict === 'bullish';
  const isBear = verdict.verdict === 'bearish';
  const stancePillStyle = isBull
    ? 'border-bull/30 bg-bull/10 text-bull'
    : isBear
      ? 'border-bear/30 bg-bear/10 text-bear'
      : 'border-warn/30 bg-warn/10 text-warn';

  const confidencePct = Math.round(
    verdict.confidence <= 1 ? verdict.confidence * 100 : verdict.confidence,
  );

  return (
    <details
      open
      className="group surface-chip border-edge/80 hover:border-brand/40 rounded-xl border p-3.5 shadow-sm transition-all [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-center justify-between rounded-lg outline-none select-none">
        <div className="flex flex-col gap-0.5">
          <span className="text-brand font-mono text-[9px] font-semibold tracking-wider uppercase">
            {meta.code}
          </span>
          <div className="flex items-center gap-1.5">
            <Icon className="text-fg-muted size-4" />
            <span className="text-fg text-xs font-semibold">{meta.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${stancePillStyle}`}
          >
            {verdict.verdict}
          </span>
          <IconChevronDown className="text-fg-subtle size-3.5 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      {/* Confidence meter */}
      <div className="mt-2.5 flex flex-col gap-1">
        <div className="text-fg-subtle flex items-center justify-between font-mono text-[10px]">
          <span>CONFIDENCE</span>
          <span className="text-fg font-semibold tabular-nums">{confidencePct}%</span>
        </div>
        <div className="surface-well h-0.5 w-full overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full ${isBull ? 'bg-bull' : isBear ? 'bg-bear' : 'bg-warn'}`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Thesis Headline */}
      <div className="text-fg mt-2.5 font-serif text-sm italic">
        &ldquo;{verdict.recommendation}&rdquo;
      </div>

      <div className="border-border/30 mt-2 space-y-2 border-t pt-2 text-xs">
        {verdict.keyPoints.length > 0 && (
          <div>
            <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
              Key Evidence:
            </span>
            <ul className="text-fg/80 mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed">
              {verdict.keyPoints.map((kp, i) => (
                <li key={i}>{kp}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="surface-well border-border/30 rounded-lg border p-2">
          <span className="text-bear font-mono text-[10px] font-semibold tracking-wider uppercase">
            Primary Invalidation Risk
          </span>
          <p className="text-fg-muted mt-0.5 text-xs">{verdict.risk}</p>
        </div>

        {verdict.sources && verdict.sources.length > 0 && (
          <div className="pt-1">
            <span className="text-fg-subtle flex items-center gap-1 font-mono text-[10px] font-semibold uppercase">
              <LinkIcon className="size-3" /> Sources
            </span>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {verdict.sources.map((src, i) => {
                let host = src;
                let isUrl = false;
                let href = src;
                try {
                  if (/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[\w- ./?%&=]*)?$/i.test(src)) {
                    isUrl = true;
                    if (!/^https?:\/\//i.test(src)) href = 'https://' + src;
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
                        className="border-border/40 bg-bg-elev-2 text-fg/80 hover:text-brand rounded border px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {host}
                      </a>
                    ) : (
                      <span className="border-border/40 bg-bg-elev-2 text-fg-subtle rounded border px-1.5 py-0.5 font-mono text-[10px]">
                        {src}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
