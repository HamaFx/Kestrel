// SPDX-License-Identifier: Apache-2.0

// Compact Kestrel legend primitive shared across analytical chart headers.
import { cn } from '@/lib/formatters/cn';

type ChartTone = 'bull' | 'bear' | 'brand' | 'muted' | 'warn' | 'neutral';

const DOT_TONE: Record<ChartTone, string> = {
  bull: 'bg-bull',
  bear: 'bg-bear',
  brand: 'bg-brand',
  muted: 'bg-fg-subtle',
  warn: 'bg-warn',
  neutral: 'bg-fg-subtle',
};

export function ChartLegend({
  items,
  className,
  shape = 'line',
}: {
  items: ReadonlyArray<{
    label: string;
    tone: ChartTone;
    dualTone?: readonly [ChartTone, ChartTone];
    dashed?: boolean;
  }>;
  className?: string;
  shape?: 'line' | 'bar';
}) {
  return (
    <div
      className={cn(
        'text-fg-subtle flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[9px] tracking-wider uppercase',
        className,
      )}
    >
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          {item.dualTone ? (
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex overflow-hidden',
                shape === 'line' ? 'h-[2px] w-3.5 rounded-full' : 'h-2 w-2.5 rounded-[2px]',
              )}
            >
              <span className={cn('h-full w-1/2', DOT_TONE[item.dualTone[0]])} />
              <span className={cn('h-full w-1/2', DOT_TONE[item.dualTone[1]])} />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                shape === 'line' ? 'h-[2px] w-3.5 rounded-full' : 'h-2 w-2 rounded-[2px]',
                DOT_TONE[item.tone],
                item.dashed && 'opacity-50',
              )}
            />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}
