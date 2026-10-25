// SPDX-License-Identifier: Apache-2.0

// Per-desk verdict card for the convene_committee renderer.

import type { CommitteeVerdict } from '@kestrel/shared';
import { IconChevronDown, IconUsers, IconLink as LinkIcon } from '@tabler/icons-react';

import { PERSONA_LABELS } from './persona-labels';

export function VerdictCard({ verdict }: { verdict: CommitteeVerdict }) {
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
