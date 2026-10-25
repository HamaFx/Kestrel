// SPDX-License-Identifier: Apache-2.0
// Size/padding class maps and tone colours for <Segmented> segments.

import type { SegmentedSize, SegmentedTone } from './segmented-types';

export const SIZE: Record<SegmentedSize, string> = {
  xs: 'h-8 text-xs',
  sm: 'h-10 sm:h-9 text-xs sm:text-sm',
  md: 'h-11 sm:h-12 text-sm',
};

export const ITEM_PAD: Record<SegmentedSize, string> = {
  xs: 'px-2 py-1',
  sm: 'px-2.5 sm:px-3 py-1.5 sm:py-2',
  md: 'px-3.5 sm:px-4 py-2 sm:py-2.5',
};

export function itemMinWidth(size: SegmentedSize): string {
  return size === 'xs'
    ? 'min-w-[32px]'
    : size === 'sm'
      ? 'min-w-[44px] sm:min-w-[36px]'
      : 'min-w-[44px]';
}

export function toneClass(tone: SegmentedTone | undefined): string {
  if (tone === 'bull') return 'bg-bull text-black';
  if (tone === 'bear') return 'bg-bear text-black';
  return 'bg-brand text-brand-fg';
}
