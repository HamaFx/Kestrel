// SPDX-License-Identifier: Apache-2.0

// Loading / error placeholders for the convene_committee renderer.

export function SkeletonCard() {
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

export function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-xl border p-3.5 text-xs"
    >
      Committee convening failed{message ? ` · ${message}` : ''}
    </div>
  );
}
