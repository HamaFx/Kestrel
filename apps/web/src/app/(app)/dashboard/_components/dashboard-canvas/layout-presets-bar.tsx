'use client';

// SPDX-License-Identifier: Apache-2.0

// Edit-mode bar that restructures the whole canvas from a curated role preset.
import { PRESET_LAYOUTS, type LayoutPresetName, type WidgetConfig } from '../widget-types';

export function LayoutPresetsBar({ onSelect }: { onSelect: (layout: WidgetConfig[]) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#F4F1EA]/10 bg-[#111114] p-3.5 shadow-md duration-200">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold tracking-wider text-[#D4AF37] uppercase">
          Role Layout Presets
        </span>
        <span className="font-sans text-xs text-[#F4F1EA]/60">
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
              className="inline-flex cursor-pointer touch-manipulation items-center gap-1.5 rounded-lg border border-[#F4F1EA]/10 bg-[#09090B] px-3 py-1.5 font-mono text-xs font-medium text-[#F4F1EA] transition-all hover:border-[#D4AF37]/40 hover:text-[#D4AF37] active:translate-y-[0.5px]"
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
