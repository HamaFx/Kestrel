'use client';

// SPDX-License-Identifier: Apache-2.0

// Step 1 of the pre-session ritual: emotional and psychological state picker.
import {
  IconAlertTriangle,
  IconBrain,
  IconHeartbeat,
  IconScale,
  IconTarget,
} from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

const MINDSET_OPTIONS = [
  { id: 'calm', label: 'Calm & Patient', icon: IconBrain, desc: 'Ready to wait for A+ setups' },
  { id: 'focused', label: 'Sharp & Focused', icon: IconTarget, desc: '100% focused on execution' },
  {
    id: 'neutral',
    label: 'Neutral & Objective',
    icon: IconScale,
    desc: 'Unbiased market observation',
  },
  {
    id: 'fatigued',
    label: 'Tired / Distracted',
    icon: IconAlertTriangle,
    desc: 'Recommend half-risk only',
  },
];

export function MindsetSection({
  mindset,
  onSelect,
}: {
  mindset: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
        <IconHeartbeat className="text-brand size-3.5" />
        1. Emotional & Psychological State
      </span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MINDSET_OPTIONS.map((opt) => {
          const active = mindset === opt.id;
          const OptIcon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all active:translate-y-[0.5px]',
                active
                  ? 'border-brand bg-brand/10 text-fg ring-brand shadow-[0_0_12px_rgba(255,54,22,0.15)] ring-1'
                  : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg hover:border-border-hover',
              )}
            >
              <OptIcon className="text-brand size-5" />
              <span className="text-xs font-semibold">{opt.label}</span>
              <span className="text-fg-subtle text-caption leading-tight">{opt.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
