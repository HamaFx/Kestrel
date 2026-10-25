'use client';

// SPDX-License-Identifier: Apache-2.0

// One floating axonometric plate in the 3D exploded isometric stack, with
// dynamic spring separation physics driven by the active layer index.
import { IconShieldLock } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import type { LayerSpec } from './layers';

interface ArchitectureLayerPlateProps {
  layer: LayerSpec;
  index: number;
  activeIndex: number;
  isActive: boolean;
  onActivate: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

export function ArchitectureLayerPlate({
  layer,
  index,
  activeIndex,
  isActive,
  onActivate,
  onHoverStart,
  onHoverEnd,
}: ArchitectureLayerPlateProps) {
  const separationY =
    index === activeIndex
      ? -18
      : index < activeIndex
        ? -(activeIndex - index) * 78
        : (index - activeIndex) * 78;

  const baseTopPercent = index * 24 + 8;
  const LayerIcon = layer.icon;

  return (
    <m.div
      onClick={onActivate}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      animate={{
        y: separationY,
        scale: isActive ? 1.06 : 0.96,
        opacity: isActive ? 1 : 0.65,
      }}
      transition={{
        type: 'spring',
        stiffness: 320,
        damping: 24,
        mass: 0.8,
      }}
      className="group absolute inset-x-0 cursor-pointer"
      style={{
        top: `${baseTopPercent}%`,
        zIndex: isActive ? 50 : 20 + (4 - index),
        transformStyle: 'preserve-3d',
      }}
    >
      {/* The Axonometric Plate */}
      <div
        className={cn(
          'relative flex aspect-[354/195] w-full flex-col justify-between rounded-2xl border p-5 backdrop-blur-md transition-all duration-300',
          isActive
            ? 'border-brand ring-brand/40 bg-[#18191b]/98 shadow-[0_24px_60px_rgba(255,54,22,0.35),inset_0_1.5px_0_rgba(255,255,255,0.3)] ring-1'
            : 'border-white/10 bg-[#111213]/85 shadow-[0_12px_32px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] hover:border-white/20 hover:bg-[#141516]/95',
        )}
        style={{
          transform: 'rotate(30deg) skewX(-30deg) scaleY(0.866025)',
          transformStyle: 'preserve-3d',
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-2 rounded-full',
                isActive ? 'bg-brand animate-pulse shadow-[0_0_8px_#ff3616]' : 'bg-white/20',
              )}
            />
            <span className="text-fg-subtle font-mono text-[10px] font-bold tracking-wider uppercase">
              TIER {layer.num} // {layer.id.toUpperCase()}
            </span>
          </div>
          <LayerIcon className={cn('size-4', isActive ? layer.accentColor : 'text-fg-subtle')} />
        </div>

        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className={cn('font-bold tracking-wider', isActive ? 'text-fg' : 'text-fg-subtle')}>
            {layer.title}
          </span>
          {isActive && (
            <span className="text-brand bg-brand/10 border-brand/30 rounded border px-1.5 py-0.5 text-[9px] font-bold shadow-[0_0_8px_rgba(255,54,22,0.2)]">
              ACTIVE LAYER
            </span>
          )}
        </div>

        <div className="text-fg-subtle flex items-center justify-between border-t border-white/5 pt-1.5 font-mono text-[9px]">
          <div className="flex items-center gap-1">
            <IconShieldLock className="text-bull size-3" />
            <span>VERIFIED LAYER</span>
          </div>
          <span className="text-bull font-semibold">ACTIVE</span>
        </div>
      </div>
    </m.div>
  );
}
