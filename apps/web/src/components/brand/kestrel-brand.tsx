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

// SPDX-License-Identifier: Apache-2.0

import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

export type KestrelBrandVariant = 'mark' | 'lockup';

interface KestrelBrandProps {
  /** The square mark is for compact chrome; the lockup is for identity moments. */
  variant?: KestrelBrandVariant;
  /** Render the brand as a home link. */
  href?: string;
  /** Label used by the compact mark+name treatment. */
  label?: string;
  /** Add the product name beside the square mark. */
  showName?: boolean;
  /** Size the mark for compact chrome or tiny assistant identity slots. */
  markSize?: 'xs' | 'sm';
  /** Hide the image from assistive technology when nearby copy names it. */
  decorative?: boolean;
  priority?: boolean;
  className?: string;
}

/**
 * Kestrel's single source of truth for product identity in the UI.
 *
 * Uses optical scaling across two vector cuts of the Base 3E ocular falcon mark:
 * - `/brand/kestrel-falcon-xs.svg` for `markSize="xs"` (14px-16px slots) with
 *   solidified feather blades and an enlarged #FF3616 diamond pupil.
 * - `/brand/kestrel-falcon.svg` for `markSize="sm"` and `variant="lockup"`
 *   where the full Eye of Horus spiral and feather geometry are visible.
 *
 * Both cuts carry their own fills — a #E5E5E5 body with the #FF3616 pupil — so
 * the mark's colour is intrinsic. An `<img>`-referenced SVG renders as its own
 * document and cannot inherit this page's CSS, so a `text-brand` utility here
 * would be inert; tint the mark by editing the SVG, not the class list. The app
 * is dark-only, so that fixed light fill is what we want on every surface.
 */
export function KestrelBrand({
  variant = 'lockup',
  href,
  label = 'Kestrel',
  showName = false,
  markSize = 'sm',
  decorative = false,
  priority: _priority = false,
  className,
}: KestrelBrandProps) {
  const isDecorative = decorative && !href;
  const markSrc =
    variant === 'mark' && markSize === 'xs'
      ? '/brand/kestrel-falcon-xs.svg'
      : '/brand/kestrel-falcon.svg';

  const image =
    variant === 'mark' ? (
      <span
        className={cn(
          'icon-housing-brand surface-chip relative flex items-center justify-center overflow-hidden border transition-all duration-200',
          markSize === 'xs' ? 'rounded-md p-1' : 'rounded-lg p-1.5',
        )}
      >
        <img
          src={markSrc}
          alt={isDecorative ? '' : 'Kestrel'}
          aria-hidden={isDecorative || undefined}
          width={24}
          height={24}
          className={cn('relative z-10 shrink-0', markSize === 'xs' ? 'size-3.5' : 'size-5')}
        />
      </span>
    ) : (
      <div className="group/brand flex items-center gap-2.5">
        <span className="icon-housing-brand surface-chip group-hover/brand:border-brand/60 relative flex items-center justify-center overflow-hidden rounded-lg border p-1.5 shadow-sm transition-all duration-200 group-hover/brand:shadow-[0_0_16px_rgba(255,54,22,0.28)]">
          <img
            src="/brand/kestrel-falcon.svg"
            alt={isDecorative ? '' : 'Kestrel'}
            aria-hidden={isDecorative || undefined}
            width={26}
            height={26}
            className="relative z-10 size-6 transition-transform duration-200 group-hover/brand:scale-[1.04]"
          />
        </span>
        <span className="font-display text-fg text-[18px] font-normal tracking-[-0.02em]">
          {label}
        </span>
      </div>
    );

  const content =
    variant === 'mark' && showName ? (
      <span className="inline-flex items-center gap-2">
        {image}
        <span className="font-display text-fg text-[15px] font-normal tracking-[-0.02em]">
          {label}
        </span>
      </span>
    ) : (
      image
    );

  const wrapperClassName = cn(
    'inline-flex shrink-0 items-center',
    variant === 'lockup' ? 'w-auto' : undefined,
    className,
  );

  if (href) {
    return (
      <Link href={href} aria-label="Kestrel home" className={wrapperClassName}>
        {content}
      </Link>
    );
  }

  return (
    <span
      aria-hidden={isDecorative || undefined}
      data-brand-variant={variant}
      className={wrapperClassName}
    >
      {content}
    </span>
  );
}
