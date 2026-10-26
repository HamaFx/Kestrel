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
      className="group surface-chip rounded-xl border border-edge/80 p-3.5 shadow-sm transition-all hover:border-brand/40 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-center justify-between rounded-lg outline-none select-none">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] font-semibold tracking-wider text-brand uppercase">
            {meta.code}
          </span>
          <div className="flex items-center gap-1.5">
            <Icon className="size-4 text-fg-muted" />
            <span className="text-xs font-semibold text-fg">{meta.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${stancePillStyle}`}>
            {verdict.verdict}
          </span>
          <IconChevronDown className="size-3.5 text-fg-subtle transition-transform group-open:rotate-180" />
        </div>
      </summary>

      {/* Confidence meter */}
      <div className="mt-2.5 flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[10px] text-fg-subtle">
          <span>CONFIDENCE</span>
          <span className="font-semibold tabular-nums text-fg">{confidencePct}%</span>
        </div>
        <div className="surface-well h-0.5 w-full overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full ${isBull ? 'bg-bull' : isBear ? 'bg-bear' : 'bg-warn'}`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Thesis Headline */}
      <div className="mt-2.5 font-serif text-sm italic text-fg">
        &ldquo;{verdict.recommendation}&rdquo;
      </div>

      <div className="mt-2 space-y-2 border-t border-border/30 pt-2 text-xs">
        {verdict.keyPoints.length > 0 && (
          <div>
            <span className="font-mono text-[10px] font-semibold tracking-wider text-brand uppercase">
              Key Evidence:
            </span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-fg/80">
              {verdict.keyPoints.map((kp, i) => (
                <li key={i}>{kp}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="surface-well rounded-lg border border-border/30 p-2">
          <span className="font-mono text-[10px] font-semibold tracking-wider text-bear uppercase">
            Primary Invalidation Risk
          </span>
          <p className="mt-0.5 text-xs text-fg-muted">{verdict.risk}</p>
        </div>

        {verdict.sources && verdict.sources.length > 0 && (
          <div className="pt-1">
            <span className="flex items-center gap-1 font-mono text-[10px] font-semibold text-fg-subtle uppercase">
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
                        className="rounded border border-border/40 bg-bg-elev-2 px-1.5 py-0.5 font-mono text-[10px] text-fg/80 hover:text-brand"
                      >
                        {host}
                      </a>
                    ) : (
                      <span className="rounded border border-border/40 bg-bg-elev-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
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
