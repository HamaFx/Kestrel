// SPDX-License-Identifier: Apache-2.0
// Public prop types for <Segmented>, shared by the shell, list and item.

export type SegmentedVariant = 'accent' | 'solid' | 'tone';
export type SegmentedTone = 'brand' | 'bull' | 'bear';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Per-option tone — only consulted in `variant="tone"` mode. */
  tone?: SegmentedTone;
  /** Optional aria-label override for icon-only options. */
  ariaLabel?: string;
}

export interface SegmentedBaseProps<T extends string> {
  /** Optional group name for generating default aria-label */
  name?: string;
  /** Optional direct aria-label override */
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
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export interface ButtonModeProps<T extends string> extends SegmentedBaseProps<T> {
  as?: 'button';
  onChange: (next: T) => void;
}

export interface LinkModeProps<T extends string> extends SegmentedBaseProps<T> {
  as: 'link';
  hrefFor: (value: T) => string;
}

export type SegmentedProps<T extends string> = ButtonModeProps<T> | LinkModeProps<T>;

export type SegmentedSize = NonNullable<SegmentedBaseProps<string>['size']>;

/** How a single segment commits its value: navigate (link) or call back (button). */
export type SegmentedItemMode<T extends string> =
  { as: 'link'; hrefFor: (value: T) => string } | { as?: 'button'; onChange: (next: T) => void };
