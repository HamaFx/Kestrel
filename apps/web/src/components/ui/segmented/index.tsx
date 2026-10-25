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

// <Segmented> — single primitive replacing the four ad-hoc segmented controls
// the codebase had grown (TimeframePicker, SymbolPicker, alert-form's
// Segmented, journal entry-form's Pills). One shape, three rendering modes:
//
//   variant="accent"  → brand accent slide-in indicator (chart pickers)
//   variant="solid"    → flat brand bg on the active segment (forms)
//   variant="tone"     → bull/bear/brand tone per option (long/short, ↑/↓)
//
// The active indicator uses motion's shared `layoutId` so the highlight
// slides between segments. Pass a unique `groupId` per page so multiple
// Segmented controls don't share the same layout animation.
//
// Items can render as buttons (default) or links (Symbol picker on /chart
// keeps URL state). Pass `as="link"` + `hrefFor` to opt into Link mode.
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/formatters/cn';

import { SegmentedList } from './segmented-list';
import type { SegmentedItemMode, SegmentedProps } from './segmented-types';

export type {
  SegmentedOption,
  SegmentedProps,
  SegmentedTone,
  SegmentedVariant,
} from './segmented-types';
export { AmbientTelemetry } from './ambient-telemetry';

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
