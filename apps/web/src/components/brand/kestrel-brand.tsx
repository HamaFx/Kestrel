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

import { cn } from '@/lib/cn';

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
 * Launcher icons stay square and compact; the transparent lockup is reserved
 * for auth, onboarding, navigation, and empty-state identity moments.
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
  const image =
    variant === 'mark' ? (
      <span className="surface-chip bg-bg-elev-2 border-edge/60 text-brand flex items-center justify-center rounded-md border p-1.5">
        <img
          src="/brand/kestrel-falcon.svg"
          alt={isDecorative ? '' : 'Kestrel'}
          aria-hidden={isDecorative || undefined}
          width={24}
          height={24}
          className={cn('text-brand shrink-0', markSize === 'xs' ? 'size-3.5' : 'size-5')}
        />
      </span>
    ) : (
      <div className="flex items-center gap-2.5">
        <span className="surface-chip bg-bg-elev-2 border-edge/60 text-brand flex items-center justify-center rounded-md border p-1.5 shadow-sm">
          <img
            src="/brand/kestrel-falcon.svg"
            alt={isDecorative ? '' : 'Kestrel'}
            aria-hidden={isDecorative || undefined}
            width={26}
            height={26}
            className="text-brand size-6"
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
