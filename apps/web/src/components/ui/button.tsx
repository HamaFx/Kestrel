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

// Milled Hoplite hardware button primitive — no scale/whileTap that can cause
// layout shift. Specular top edge, machined bottom bevel, and 0.5px physical
// depression via `tactile-press`. Spinner uses lucide's IconLoader2 to satisfy
// steering rule §10 ("@tabler/icons-react exclusively, no inline SVGs").
//
// Mobile-first sizes:
//   xs = 32px (h-8)  — dense chip rows only
//   sm = 40px (h-10) — fits in dense action rows; 4px below 44pt min so
//                       only use sm where the button is in a row of icon
//                       buttons that already have ≥44pt hit areas
//   md = 44px (h-11) — default. Meets the WCAG 2.2 minimum touch target.
//   lg = 56px (h-14) — primary CTA on landing/empty states.

import { IconLoader2 } from '@tabler/icons-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'surface' | 'tactical';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
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
  tactical:
    'group relative overflow-hidden rounded-l-md rounded-r-full bg-[#222326] text-white border border-white/12 hover:border-brand/45 tactile-press',
};

const sizes: Record<Size, string> = {
  xs: 'h-8 px-2.5 text-xs rounded-md',
  sm: 'h-10 px-3 text-xs sm:text-sm rounded-md',
  md: 'h-11 px-4 text-sm font-medium rounded-md',
  lg: 'h-12 sm:h-14 px-5 text-base font-medium rounded-md',
};

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
        disabled={isDisabled}
        aria-busy={loading || false}
        style={inlineStyle}
        className={cn(
          'group tactile-press hover:border-brand/45 relative inline-flex items-center justify-between overflow-hidden rounded-l-[6px] rounded-r-full border border-white/12 bg-[#222326] pr-10 pl-4 leading-none tracking-[-0.02em] text-white shadow-[0_6px_20px_-4px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors',
          sizes[size],
          'focus-visible:ring-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      >
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
        <span className="relative z-10 flex items-center gap-2 font-semibold">
          {loading ? <IconLoader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
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
      </button>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || false}
      style={inlineStyle}
      className={cn(
        'tactile-press inline-flex items-center justify-center gap-2 rounded-md font-medium select-none',
        'transition-all duration-150',
        'focus-visible:ring-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <IconLoader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
