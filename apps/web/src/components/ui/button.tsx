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

// Milled Kestrel hardware button primitive + PanelUI-style width-stable loading
// overlay, square icon sizes (`icon-sm`, `icon`, `icon-lg`), and `ButtonGroup`.

import { IconLoader2 } from '@tabler/icons-react';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'surface' | 'tactical';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon' | 'icon-lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Exclude<Variant, 'tactical'>, string> = {
  primary:
    'bg-brand text-white font-medium border border-brand/60 shadow-[0_4px_14px_rgba(255,54,22,0.32),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.35)] hover:brightness-110 hover:shadow-[0_6px_20px_rgba(255,54,22,0.44),inset_0_1px_0_rgba(255,255,255,0.38)]',
  secondary:
    'surface-button text-fg border border-white/[0.09] hover:border-white/[0.18] hover:brightness-110',
  surface: 'surface-chip-dark text-white hover:border-brand/40 hover:brightness-120',
  ghost:
    'text-fg-muted border border-transparent hover:text-fg hover:bg-bg-elev-2/80 hover:border-white/[0.06]',
  danger:
    'bg-danger text-white font-medium border border-danger/60 shadow-[0_4px_14px_rgba(240,62,62,0.28),inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)] hover:brightness-110',
  success:
    'bg-success text-black font-semibold border border-success/60 shadow-[0_4px_14px_rgba(63,158,61,0.25),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.25)] hover:brightness-105',
};

const sizes: Record<Size, string> = {
  xs: 'h-8 px-2.5 text-xs rounded-lg',
  sm: 'h-10 px-3 text-xs sm:text-sm rounded-lg',
  md: 'h-11 px-4 text-sm font-medium rounded-lg',
  lg: 'h-12 sm:h-14 px-5 text-base font-medium rounded-lg',
  'icon-sm': 'size-8 p-0 rounded-lg shrink-0',
  icon: 'size-10 p-0 rounded-lg shrink-0',
  'icon-lg': 'size-11 p-0 rounded-lg shrink-0',
};

export function TacticalButtonChrome({
  children,
  loading,
}: {
  children: React.ReactNode;
  loading?: boolean | undefined;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 right-1 h-[1.45em] w-[3.4em] rounded-full bg-[#ff4800]/22 blur-[0.42em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[8.2em]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 right-1 h-[1.45em] w-[2.2em] rounded-full bg-[#ff632a]/55 blur-[0.34em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[8.2em]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 right-1 h-[1.45em] w-[1.2em] rounded-full bg-[#ff3616] blur-[0.28em] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:w-[8.2em]"
      />
      {loading ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <IconLoader2 className="size-4 animate-spin" />
        </span>
      ) : null}
      <span
        className={cn(
          'relative z-10 flex items-center gap-2 font-semibold',
          loading && 'invisible',
        )}
      >
        {children}
      </span>
      <svg
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-[0.8em] z-10 size-[0.85em] -translate-y-1/2 text-white"
        aria-hidden="true"
      >
        <rect
          x="0"
          y="5"
          width="2"
          height="2"
          rx="0.5"
          fill="currentColor"
          className="transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:[width:12px]"
        />
        <rect
          x="5"
          y="0"
          width="2"
          height="2"
          rx="0.5"
          fill="currentColor"
          className="transition-[height] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:[height:12px]"
        />
        <rect x="5" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
        <rect x="5" y="10" width="2" height="2" rx="0.5" fill="currentColor" />
        <rect x="10" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
      </svg>
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading,
    disabled,
    children,
    type = 'button',
    style,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading || false;
  const inlineStyle: React.CSSProperties = style ?? {};

  if (variant === 'tactical') {
    return (
      <button
        ref={ref}
        type={type}
        data-slot="button"
        disabled={isDisabled}
        aria-busy={loading || false}
        style={inlineStyle}
        className={cn(
          'group tactile-press hover:border-brand/45 relative inline-flex items-center justify-between gap-3 overflow-hidden border border-white/12 bg-[#222326] leading-none tracking-[-0.02em] text-white shadow-[0_6px_20px_-4px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors select-none',
          sizes[size],
          'rounded-l-md rounded-r-full pr-9 pl-4',
          'focus-visible:ring-brand focus-visible:ring-offset-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      >
        <TacticalButtonChrome loading={loading}>{children}</TacticalButtonChrome>
      </button>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      disabled={isDisabled}
      aria-busy={loading || false}
      style={inlineStyle}
      className={cn(
        'tactile-press relative inline-flex items-center justify-center gap-2 font-medium select-none',
        'transition-all duration-150',
        'focus-visible:ring-brand focus-visible:ring-offset-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <IconLoader2 className="size-4 animate-spin" />
        </span>
      ) : null}
      <span
        className={cn('inline-flex items-center justify-center gap-2', loading && 'invisible')}
      >
        {children}
      </span>
    </button>
  );
});

export const ButtonGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ButtonGroup({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        role="group"
        data-slot="button-group"
        className={cn(
          'inline-flex items-center',
          '[&>[data-slot=button]]:hover:z-10 [&>[data-slot=button]]:focus-visible:z-10',
          '[&>[data-slot=button]:not(:first-child)]:-ml-px [&>[data-slot=button]:not(:first-child)]:rounded-l-none',
          '[&>[data-slot=button]:not(:last-child)]:rounded-r-none',
          className,
        )}
        {...rest}
      />
    );
  },
);
