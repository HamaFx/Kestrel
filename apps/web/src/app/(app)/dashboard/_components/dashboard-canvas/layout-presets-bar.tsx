'use client';

// SPDX-License-Identifier: Apache-2.0

// Edit-mode bar that restructures the whole canvas from a curated role preset.
import { PRESET_LAYOUTS, type LayoutPresetName, type WidgetConfig } from '../widget-types';

export function LayoutPresetsBar({ onSelect }: { onSelect: (layout: WidgetConfig[]) => void }) {
  return (
    <div className="surface-panel border-border bg-bg-elev-1 flex flex-col gap-2 rounded-xl border p-3.5 shadow-md duration-200">
      <div className="flex items-center justify-between">
        <span className="text-brand font-mono text-xs font-bold tracking-wider uppercase">
          Role Layout Presets
        </span>
        <span className="text-fg-subtle font-sans text-xs">
          Click a preset to instantly restructure your workspace
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PRESET_LAYOUTS) as LayoutPresetName[]).map((key) => {
          const preset = PRESET_LAYOUTS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onSelect(preset.layout);
              }}
              className="surface-chip border-border bg-bg-elev-2 text-fg hover:border-brand/40 hover:text-brand inline-flex cursor-pointer touch-manipulation items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-all active:translate-y-[0.5px]"
              title={preset.description}
            >
              <span>{preset.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
