// SPDX-License-Identifier: Apache-2.0

// Loading / error placeholders for the `get_indicators` tool part.

export function IndicatorsCardSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Loading indicators"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-40 animate-pulse rounded-sm" />
      <ul className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="bg-bg-elev-2 h-4 w-20 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-4 w-28 animate-pulse rounded-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IndicatorsCardError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Indicators unavailable{message ? ` · ${message}` : ''}
    </div>
  );
}
