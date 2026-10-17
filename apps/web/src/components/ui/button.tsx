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

// Static button — no scale/whileTap that can cause layout shift.
// Opacity + color transitions only. Spinner uses lucide's IconLoader2 to
// satisfy steering rule §10 ("@tabler/icons-react exclusively, no inline SVGs").
//
// Mobile-first sizes:
//   sm = 40px (h-10) — fits in dense action rows; 4px below 44pt min so
//                       only use sm where the button is in a row of icon
//                       buttons that already have ≥44pt hit areas
//   md = 48px (h-12) — default. Comfortable thumb-zone target.
//   lg = 56px (h-14) — primary CTA on landing/empty states.

import { IconLoader2 } from '@tabler/icons-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'surface' | 'tactical';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-white font-medium hover:brightness-110 border border-brand/40 shadow-[0_4px_14px_rgba(255,54,22,0.3),inset_0_1.4px_0_rgba(255,255,255,0.25)]',
  secondary:
    'surface-chip text-fg hover:bg-bg-elev-3 border border-edge/60',
  surface:
    'surface-chip-dark text-white hover:brightness-125',
  ghost: 'text-fg-muted hover:text-fg hover:bg-bg-elev-1',
  danger:
    'bg-danger text-white font-medium hover:bg-danger/90 shadow-[0_4px_12px_rgba(224,44,16,0.25)]',
  success: 'bg-success text-black font-medium hover:bg-success/90',
  tactical:
    'group relative overflow-hidden rounded-l-md rounded-r-full bg-[#252525] text-white border border-white/10 tactile-press',
};

const sizes: Record<Size, string> = {
  xs: 'h-8 px-2.5 text-xs rounded-md',
  sm: 'h-10 px-3 text-xs sm:text-sm rounded-md',
  md: 'h-10 px-4 text-sm font-medium rounded-md',
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
          'group relative inline-flex items-center justify-between overflow-hidden rounded-l-[6px] rounded-r-full bg-[#252525] pr-10 pl-4 leading-none tracking-[-0.02em] text-white tactile-press active:translate-y-[0.5px] border border-white/10',
          sizes[size],
          'focus-visible:ring-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      >
        <span aria-hidden="true" className="pointer-events-none absolute top-1 right-1 h-[1.4em] w-[3em] rounded-full bg-[#ff4800]/20 blur-[0.4em] transition-[width] duration-500 group-hover:w-[7em]" />
        <span aria-hidden="true" className="pointer-events-none absolute top-1 right-1 h-[1.4em] w-[2em] rounded-full bg-[#ff632a]/50 blur-[0.3em] transition-[width] duration-500 group-hover:w-[7em]" />
        <span aria-hidden="true" className="pointer-events-none absolute top-1 right-1 h-[1.4em] w-[1em] rounded-full bg-[#ff3616] blur-[0.25em] transition-[width] duration-500 group-hover:w-[7em]" />
        <span className="relative z-10 flex items-center gap-2">
          {loading ? <IconLoader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {children}
        </span>
        <svg viewBox="0 0 12 12" className="pointer-events-none absolute top-1/2 right-[0.75em] size-[0.85em] -translate-y-1/2 text-white" aria-hidden="true">
          <rect x="0" y="5" width="2" height="2" rx="0.5" fill="currentColor" className="transition-[width] duration-300 group-hover:[width:12px]" />
          <rect x="5" y="0" width="2" height="2" rx="0.5" fill="currentColor" className="transition-[height] duration-300 group-hover:[height:12px]" />
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
        'inline-flex items-center justify-center gap-2 rounded-md font-medium tactile-press active:translate-y-[0.5px]',
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
