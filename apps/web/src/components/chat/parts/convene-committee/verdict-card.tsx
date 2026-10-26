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
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    : isBear
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-400';

  const confidencePct = Math.round(verdict.confidence * 10);

  return (
    <details
      open
      className="group rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-3.5 shadow-sm transition-all hover:border-[#D4AF37]/30 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-center justify-between rounded-lg outline-none select-none">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] font-semibold tracking-wider text-[#D4AF37] uppercase">
            {meta.code}
          </span>
          <div className="flex items-center gap-1.5">
            <Icon className="size-4 text-[#F4F1EA]/70" />
            <span className="text-xs font-semibold text-[#F4F1EA]">{meta.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${stancePillStyle}`}>
            {verdict.verdict}
          </span>
          <IconChevronDown className="size-3.5 text-[#F4F1EA]/40 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      {/* Confidence meter */}
      <div className="mt-2.5 flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[10px] text-[#F4F1EA]/60">
          <span>CONFIDENCE</span>
          <span className="font-semibold tabular-nums text-[#F4F1EA]">{confidencePct}%</span>
        </div>
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-[#16161A]">
          <div
            className={`h-full rounded-full ${isBull ? 'bg-emerald-400' : isBear ? 'bg-rose-400' : 'bg-amber-400'}`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Thesis Headline */}
      <div className="mt-2.5 font-serif text-sm italic text-[#F4F1EA]">
        &ldquo;{verdict.recommendation}&rdquo;
      </div>

      <div className="mt-2 space-y-2 border-t border-[#F4F1EA]/10 pt-2 text-xs">
        {verdict.keyPoints.length > 0 && (
          <div>
            <span className="font-mono text-[10px] font-semibold tracking-wider text-[#D4AF37] uppercase">
              Key Evidence:
            </span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-[#F4F1EA]/80">
              {verdict.keyPoints.map((kp, i) => (
                <li key={i}>{kp}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-[#F4F1EA]/5 bg-[#09090B] p-2">
          <span className="font-mono text-[10px] font-semibold tracking-wider text-rose-400 uppercase">
            Primary Invalidation Risk
          </span>
          <p className="mt-0.5 text-xs text-[#F4F1EA]/70">{verdict.risk}</p>
        </div>

        {verdict.sources && verdict.sources.length > 0 && (
          <div className="pt-1">
            <span className="flex items-center gap-1 font-mono text-[10px] font-semibold text-[#F4F1EA]/50 uppercase">
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
                        className="rounded border border-[#F4F1EA]/10 bg-[#16161A] px-1.5 py-0.5 font-mono text-[10px] text-[#F4F1EA]/80 hover:text-[#D4AF37]"
                      >
                        {host}
                      </a>
                    ) : (
                      <span className="rounded border border-[#F4F1EA]/10 bg-[#16161A] px-1.5 py-0.5 font-mono text-[10px] text-[#F4F1EA]/60">
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
