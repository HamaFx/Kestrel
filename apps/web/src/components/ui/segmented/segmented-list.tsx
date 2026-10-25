'use client';

// SPDX-License-Identifier: Apache-2.0

// Segmented container: the ARIA group, keyboard handling and the option map.
import { cn } from '@/lib/formatters/cn';

import { SegmentedItem } from './segmented-item';
import type {
  SegmentedItemMode,
  SegmentedOption,
  SegmentedSize,
  SegmentedVariant,
} from './segmented-types';

export function SegmentedList<T extends string>({
  role,
  ariaLabel,
  variant,
  size,
  className,
  containerRef,
  onKeyDown,
  options,
  value,
  focusedIndex,
  layoutId,
  mode,
}: {
  role: 'tablist' | 'radiogroup';
  ariaLabel: string | undefined;
  variant: SegmentedVariant;
  size: SegmentedSize;
  className: string | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  focusedIndex: number;
  layoutId: string;
  mode: SegmentedItemMode<T>;
}) {
  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      data-segmented={variant}
      onKeyDown={onKeyDown}
      className={cn(
        variant === 'accent'
          ? 'border-border bg-bg-elev-2 inline-flex items-center gap-0.5 rounded-sm border p-0.5'
          : 'border-border bg-bg-elev-2 inline-flex flex-wrap items-center gap-0.5 rounded-sm border p-0.5',
        className,
      )}
    >
      {options.map((opt, optIndex) => (
        <SegmentedItem
          key={opt.value}
          option={opt}
          active={opt.value === value}
          tabIndex={optIndex === focusedIndex ? 0 : -1}
          role={role}
          variant={variant}
          size={size}
          layoutId={layoutId}
          mode={mode}
        />
      ))}
    </div>
  );
}
