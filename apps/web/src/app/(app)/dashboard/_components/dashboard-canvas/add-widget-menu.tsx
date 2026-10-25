'use client';

// SPDX-License-Identifier: Apache-2.0

// AddWidgetMenu — small popover that lists widget types not currently on
// the canvas. We use a native <details>/<summary> for simplicity so we
// don't pull in another popover primitive.
import { IconPlus } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';

import type { WidgetType } from '../widget-types';

export function AddWidgetMenu({
  hidden,
  onAdd,
}: {
  hidden: Array<{ type: WidgetType; label: string }>;
  onAdd: (type: WidgetType) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        ref.current.open = false;
      }
    }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (hidden.length === 0) return null;
  return (
    <details ref={ref} className="relative">
      <summary
        className="surface-chip text-fg inline-flex min-h-[34px] cursor-pointer list-none items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1 font-mono text-xs font-medium transition-all hover:border-white/20 active:translate-y-[0.5px]"
        aria-label="Add widget"
      >
        <IconPlus className="text-brand size-4" />
        Add widget
      </summary>
      <div className="surface-panel absolute right-0 z-20 mt-1.5 flex min-w-[200px] flex-col rounded-xl border border-white/15 bg-[#141516]/98 p-1.5 shadow-2xl backdrop-blur-xl">
        {hidden.map((item) => (
          <button
            key={item.type}
            type="button"
            onClick={() => onAdd(item.type)}
            className="text-fg-muted hover:text-fg rounded-lg px-3 py-2 text-left font-sans text-xs transition-colors hover:bg-white/5 active:translate-y-[0.5px]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
