'use client';

// SPDX-License-Identifier: Apache-2.0

// A single segment: renders as a button or a link, with the animated accent
// indicator and the shared active/tone styling.
import { m } from 'motion/react';
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

import { ITEM_PAD, itemMinWidth, SIZE, toneClass } from './segmented-tokens';
import type {
  SegmentedItemMode,
  SegmentedOption,
  SegmentedSize,
  SegmentedVariant,
} from './segmented-types';

export function SegmentedItem<T extends string>({
  option,
  active,
  tabIndex,
  role,
  variant,
  size,
  layoutId,
  mode,
}: {
  option: SegmentedOption<T>;
  active: boolean;
  tabIndex: number;
  role: 'tablist' | 'radiogroup';
  variant: SegmentedVariant;
  size: SegmentedSize;
  layoutId: string;
  mode: SegmentedItemMode<T>;
}) {
  const baseItem = cn(
    'relative inline-flex items-center justify-center rounded-sm font-semibold tabular-nums transition-colors tactile-press active:translate-y-[0.5px]',
    'focus-visible:ring-fg focus:outline-none focus-visible:ring-2',
    itemMinWidth(size),
    ITEM_PAD[size],
    SIZE[size],
    !active && 'text-fg-muted hover:text-fg',
    active && variant === 'accent' && 'text-black',
    active && variant === 'solid' && 'bg-fg text-black',
    active && variant === 'tone' && toneClass(option.tone),
  );

  const indicator =
    active && variant === 'accent' ? (
      <m.span
        layoutId={layoutId}
        className="bg-brand absolute inset-0 -z-0 rounded-sm"
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      />
    ) : null;

  const labelEl = <span className="relative z-10 leading-none">{option.label}</span>;

  if (mode.as === 'link') {
    return (
      <Link
        href={mode.hrefFor(option.value)}
        role={role === 'tablist' ? 'tab' : undefined}
        aria-label={option.ariaLabel}
        aria-selected={role === 'tablist' ? active : undefined}
        tabIndex={tabIndex}
        className={baseItem}
      >
        {indicator}
        {labelEl}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role={role === 'tablist' ? 'tab' : 'radio'}
      aria-label={option.ariaLabel}
      aria-selected={role === 'tablist' ? active : undefined}
      aria-checked={role === 'radiogroup' ? active : undefined}
      tabIndex={tabIndex}
      onClick={() => mode.onChange(option.value)}
      className={baseItem}
    >
      {indicator}
      {labelEl}
    </button>
  );
}
