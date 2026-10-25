// SPDX-License-Identifier: Apache-2.0

// Loading / error placeholders for the `get_candles` tool part.

export function CandlesCardSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Loading candles"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-40 animate-pulse rounded-sm" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="bg-bg-elev-2 h-2 w-4 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-4 w-12 animate-pulse rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CandlesCardError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Candles unavailable{message ? ` · ${message}` : ''}
    </div>
  );
}
