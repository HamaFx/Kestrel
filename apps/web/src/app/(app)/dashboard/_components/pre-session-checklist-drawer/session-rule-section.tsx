'use client';

// SPDX-License-Identifier: Apache-2.0

// Step 3 of the pre-session ritual: pick the single execution focus rule for
// the session.
import { IconCheck, IconSparkles } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import { PRESET_RULES } from './session-plan';

export function SessionRuleSection({
  primaryRule,
  customRule,
  onSelect,
}: {
  primaryRule: string;
  customRule: string;
  onSelect: (rule: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
        <IconSparkles className="text-warn size-3.5" />
        3. Session Execution Focus Rule
      </span>
      <div className="flex flex-col gap-1.5">
        {PRESET_RULES.map((rule) => {
          const active = primaryRule === rule && !customRule;
          return (
            <button
              key={rule}
              type="button"
              onClick={() => onSelect(rule)}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-all active:translate-y-[0.5px]',
                active
                  ? 'border-brand bg-brand/10 text-fg ring-brand font-medium ring-1'
                  : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg',
              )}
            >
              <div
                className={cn(
                  'flex size-3.5 shrink-0 items-center justify-center rounded-full border',
                  active ? 'border-brand bg-brand text-bg' : 'border-border',
                )}
              >
                {active && <IconCheck className="size-2.5 stroke-[3]" />}
              </div>
              <span>{rule}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
