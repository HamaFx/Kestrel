'use client';

// SPDX-License-Identifier: Apache-2.0

// Journal tag strip with psychology-specific colour coding.
import { cn } from '@/lib/formatters/cn';

export function TagList({ tags }: { tags: string[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.map((t) => {
        const psychStyle = {
          Disciplined: 'bg-bull/15 text-bull border-bull/30 font-semibold',
          'Plan Followed': 'bg-bull/15 text-bull border-bull/30 font-semibold',
          FOMO: 'bg-bear/15 text-bear border-bear/30 font-semibold',
          'Revenge Trade': 'bg-bear/15 text-bear border-bear/30 font-semibold',
          Hesitant: 'bg-warn/15 text-warn border-warn/30 font-semibold',
          Chased: 'bg-warn/15 text-warn border-warn/30 font-semibold',
        }[t];

        return (
          <span
            key={t}
            className={cn(
              'rounded-md border px-2 py-0.5 text-xs select-none',
              psychStyle ?? 'bg-bg-elev-1 border-border/40 text-fg-subtle font-mono',
            )}
          >
            #{t}
          </span>
        );
      })}
    </div>
  );
}
