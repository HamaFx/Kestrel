'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// <Segmented> — one primitive for view switchers and form choices.
//
//   variant="accent" → brand accent slide-in indicator (chart pickers)
//   variant="solid"  → flat foreground fill on the active segment (forms)
//   variant="tone"   → bull/bear/brand tone per option (long/short, ↑/↓)
//
// The active indicator shares a motion `layoutId` so the highlight slides
// between segments. Pass a unique `groupId` per page so multiple controls do
// not share the same animation. Items render as buttons by default, or links
// when `as="link"` + `hrefFor` are supplied.

import { m } from 'motion/react';
import { Link } from 'next-view-transitions';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/formatters/cn';

type SegmentedVariant = 'accent' | 'solid' | 'tone';
type SegmentedTone = 'brand' | 'bull' | 'bear';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Per-option tone — only consulted in `variant="tone"` mode. */
  tone?: SegmentedTone;
  /** Optional aria-label override for icon-only options. */
  ariaLabel?: string;
}

interface SegmentedBaseProps<T extends string> {
  /** Optional group name for generating default aria-label. */
  name?: string;
  /** Optional direct aria-label override. */
  ariaLabel?: string;
  /** Visible label rendered above the control. Hidden visually if `srLabel` is true. */
  label?: string;
  /** Treat `label` as visually hidden but kept for screen readers. */
  srLabel?: boolean;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** ARIA role: 'tablist' for view switchers, 'radiogroup' for form choices. */
  role?: 'tablist' | 'radiogroup';
  variant?: SegmentedVariant;
  /** Unique layout-id key. Defaults to a useId() so each instance is isolated. */
  groupId?: string;
  size?: SegmentedSize;
  className?: string;
}

interface ButtonModeProps<T extends string> extends SegmentedBaseProps<T> {
  as?: 'button';
  onChange: (next: T) => void;
}

interface LinkModeProps<T extends string> extends SegmentedBaseProps<T> {
  as: 'link';
  hrefFor: (value: T) => string;
}

export type SegmentedProps<T extends string> = ButtonModeProps<T> | LinkModeProps<T>;

type SegmentedSize = 'xs' | 'sm' | 'md';

type SegmentedItemMode<T extends string> =
  | { as: 'link'; hrefFor: (value: T) => string }
  | { as?: 'button'; onChange: (next: T) => void };

const SIZE: Record<SegmentedSize, string> = {
  xs: 'h-8 text-xs',
  sm: 'h-10 sm:h-9 text-xs sm:text-sm',
  md: 'h-11 sm:h-12 text-sm',
};

const ITEM_PAD: Record<SegmentedSize, string> = {
  xs: 'px-2 py-1',
  sm: 'px-2.5 sm:px-3 py-1.5 sm:py-2',
  md: 'px-3.5 sm:px-4 py-2 sm:py-2.5',
};

function itemMinWidth(size: SegmentedSize): string {
  return size === 'xs'
    ? 'min-w-[32px]'
    : size === 'sm'
      ? 'min-w-[44px] sm:min-w-[36px]'
      : 'min-w-[44px]';
}

function toneClass(tone: SegmentedTone | undefined): string {
  if (tone === 'bull') return 'bg-bull text-black';
  if (tone === 'bear') return 'bg-bear text-black';
  return 'bg-brand text-brand-fg';
}

function SegmentedItem<T extends string>({
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

function SegmentedList<T extends string>({
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

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const {
    name,
    ariaLabel: customAriaLabel,
    label,
    srLabel,
    value,
    options,
    role = 'tablist',
    variant = 'solid',
    groupId,
    size = 'sm',
    className,
  } = props;

  const generatedId = useId();
  const layoutId = `seg-${groupId ?? generatedId}`;
  const containerRef = useRef<HTMLDivElement>(null);

  const [focusedIndex, setFocusedIndex] = useState(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : 0;
  });

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) {
      setFocusedIndex(idx);
    }
  }, [value, options]);

  const focusIndex = (index: number) => {
    setFocusedIndex(index);
    const items = containerRef.current?.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
      'button, a',
    );
    items?.[index]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        const prev = (focusedIndex - 1 + options.length) % options.length;
        focusIndex(prev);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        e.preventDefault();
        const next = (focusedIndex + 1) % options.length;
        focusIndex(next);
        break;
      }
      case 'Home': {
        e.preventDefault();
        focusIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        focusIndex(options.length - 1);
        break;
      }
      default:
        break;
    }
  };

  const computedAriaLabel =
    customAriaLabel || label || (srLabel ? `${name ?? 'Segmented'} selector` : undefined);

  const mode: SegmentedItemMode<T> =
    props.as === 'link' ? { as: 'link', hrefFor: props.hrefFor } : { onChange: props.onChange };

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span
          className={cn(
            'text-fg-subtle text-xs font-semibold tracking-wide uppercase',
            srLabel && 'sr-only',
          )}
        >
          {label}
        </span>
      ) : null}
      <SegmentedList
        role={role}
        ariaLabel={computedAriaLabel}
        variant={variant}
        size={size}
        className={className}
        containerRef={containerRef}
        onKeyDown={handleKeyDown}
        options={options}
        value={value}
        focusedIndex={focusedIndex}
        layoutId={layoutId}
        mode={mode}
      />
    </div>
  );
}
