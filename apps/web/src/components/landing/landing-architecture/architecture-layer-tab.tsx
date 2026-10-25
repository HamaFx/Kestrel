'use client';

// SPDX-License-Identifier: Apache-2.0

// One selectable layer tab in the left column of the architecture workbench.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { LayerSpec } from './layers';

interface ArchitectureLayerTabProps {
  layer: LayerSpec;
  isActive: boolean;
  onActivate: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

export function ArchitectureLayerTab({
  layer,
  isActive,
  onActivate,
  onHoverStart,
  onHoverEnd,
}: ArchitectureLayerTabProps) {
  const Icon = layer.icon;

  return (
    <button
      type="button"
      onClick={onActivate}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={cn(
        'group relative flex cursor-pointer items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 active:translate-y-[0.5px] sm:p-5',
        isActive
          ? 'surface-chip border-white/20 bg-[#171819] shadow-[var(--shadow-chip)]'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]',
      )}
    >
      {/* Active Indicator Top Line */}
      {isActive && (
        <m.div
          layoutId="active-iso-tab-indicator"
          className="border-brand/40 bg-brand/[0.03] absolute inset-0 -z-10 rounded-xl border"
          transition={{ type: 'spring', stiffness: 450, damping: 32 }}
        />
      )}

      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold transition-colors',
          isActive
            ? 'bg-brand border-brand text-white shadow-[0_0_14px_rgba(255,54,22,0.5)]'
            : 'text-fg-subtle group-hover:text-fg border-white/10 bg-black/40',
        )}
      >
        {layer.num}
      </div>

      <div className="flex w-full flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-brand font-mono text-[10px] font-bold tracking-wider uppercase">
            {layer.tag}
          </span>
          <Icon className={cn('size-4', isActive ? layer.accentColor : 'text-fg-subtle')} />
        </div>
        <h3 className="font-display text-fg text-base font-normal tracking-tight group-hover:text-white">
          {layer.title}
        </h3>
        <p className="text-fg-muted font-sans text-xs leading-relaxed">{layer.shortDesc}</p>
      </div>
    </button>
  );
}
