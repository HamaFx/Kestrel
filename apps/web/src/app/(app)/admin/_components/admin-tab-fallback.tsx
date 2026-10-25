'use client';

// SPDX-License-Identifier: Apache-2.0

// Suspense fallback skeleton shown while an admin section chunk loads.
import { SkeletonCard } from '@/components/ui/skeleton';

export function AdminTabFallback() {
  return (
    <div className="border-border overflow-hidden rounded-sm border">
      <div className="bg-bg-elev-2 flex gap-4 px-4 py-3">
        <SkeletonCard lines={1} className="flex-1 border-0 bg-transparent p-0" />
        <SkeletonCard lines={1} className="w-20 border-0 bg-transparent p-0" />
        <SkeletonCard lines={1} className="w-24 border-0 bg-transparent p-0" />
        <SkeletonCard lines={1} className="w-16 border-0 bg-transparent p-0" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-border flex gap-4 border-t px-4 py-3">
          <SkeletonCard lines={1} className="flex-1 border-0 bg-transparent p-0" />
          <SkeletonCard lines={1} className="w-20 border-0 bg-transparent p-0" />
          <SkeletonCard lines={1} className="w-24 border-0 bg-transparent p-0" />
          <SkeletonCard lines={1} className="w-16 border-0 bg-transparent p-0" />
        </div>
      ))}
    </div>
  );
}
