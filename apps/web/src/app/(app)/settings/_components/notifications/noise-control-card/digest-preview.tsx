'use client';

// SPDX-License-Identifier: Apache-2.0

// Read-only alert preview: how the saved noise filters affect the daily
// alert volume, broken down per severity.
import { IconChartBar } from '@tabler/icons-react';

import { SEVERITY_OPTIONS } from './severity-options';
import type { DigestPreview } from './use-noise-config';

export function DigestPreviewPanel({
  preview,
  previewLoading,
}: {
  preview: DigestPreview;
  previewLoading: boolean;
}) {
  return (
    <div className="surface-well flex flex-col gap-3 rounded-xl border border-white/5 p-4 shadow-inner">
      <div className="flex items-center gap-2">
        <IconChartBar className="text-fg size-4" />
        <span className="text-fg text-sm font-semibold">Alert preview</span>
        <span className="text-fg-subtle text-xs">(based on saved settings)</span>
        {previewLoading && <span className="text-fg-muted font-mono text-xs">Refreshing…</span>}
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-fg font-mono text-2xl font-bold tabular-nums">
            {preview.breakdown.total}
          </p>
          <p className="text-fg-subtle text-xs">Total</p>
        </div>
        <div>
          <p className="text-success text-2xl font-bold tabular-nums">
            {preview.breakdown.allowed}
          </p>
          <p className="text-fg-subtle text-xs">Allowed</p>
        </div>
        <div>
          <p className="text-danger text-2xl font-bold tabular-nums">{preview.breakdown.blocked}</p>
          <p className="text-fg-subtle text-xs">Blocked</p>
        </div>
      </div>
      <div className="bg-bg-elev-3 flex h-3 w-full overflow-hidden rounded-sm">
        <div
          className="bg-fg transition-all duration-300"
          style={{ width: `${preview.allowedPct}%` }}
        />
        <div
          className="bg-fg-muted/30 transition-all duration-300"
          style={{ width: `${preview.blockedPct}%` }}
        />
      </div>
      <div className="text-caption grid grid-cols-4 gap-1 text-center tabular-nums">
        {SEVERITY_OPTIONS.map((sev) => {
          const b = preview.breakdown.bySeverity.find((s) => s.severity === sev.value);
          if (!b) return null;
          const actPct = b.total > 0 ? Math.round((b.allowed / b.total) * 100) : 0;
          return (
            <div key={sev.value} className="flex flex-col">
              <span className="text-fg-subtle">{sev.label}</span>
              <span className="text-fg font-medium">{actPct}%</span>
            </div>
          );
        })}
      </div>
      <p className="text-fg-subtle text-xs">
        ~{preview.dailyEstimate} alerts/day with current filters.
      </p>
    </div>
  );
}
