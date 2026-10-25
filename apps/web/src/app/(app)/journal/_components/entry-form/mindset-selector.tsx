'use client';

// SPDX-License-Identifier: Apache-2.0

// Trader psychology quick-selection toggles for the entry form.
import { cn } from '@/lib/formatters/cn';

interface MindsetSelectorProps {
  tags: string[];
  onToggle: (tag: string) => void;
}

export function MindsetSelector({ tags, onToggle }: MindsetSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-fg-subtle text-caption tracking-wide uppercase">
        Trader Mindset / Execution Psychology
      </label>
      <div className="flex flex-wrap gap-1.5">
        {[
          { tag: 'Disciplined', label: 'Disciplined', tone: 'bull' as const },
          { tag: 'Plan Followed', label: 'Plan Followed', tone: 'bull' as const },
          { tag: 'FOMO', label: 'FOMO', tone: 'bear' as const },
          { tag: 'Revenge Trade', label: 'Revenge Trade', tone: 'bear' as const },
          { tag: 'Hesitant', label: 'Hesitant', tone: 'warn' as const },
          { tag: 'Chased', label: 'Chased', tone: 'warn' as const },
        ].map((p) => {
          const isSelected = tags.includes(p.tag);
          return (
            <button
              key={p.tag}
              type="button"
              onClick={() => onToggle(p.tag)}
              className={cn(
                'text-caption inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 font-medium transition-all select-none',
                isSelected
                  ? p.tone === 'bull'
                    ? 'bg-bull/20 text-bull border-bull/50'
                    : p.tone === 'bear'
                      ? 'bg-bear/20 text-bear border-bear/50'
                      : 'bg-warn/20 text-warn border-warn/50'
                  : 'bg-bg-elev-1 text-fg-subtle border-border hover:text-fg hover:border-fg-muted',
              )}
            >
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
