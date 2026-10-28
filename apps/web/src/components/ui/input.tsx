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

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

// Mobile-first: h-12 (48px) — comfortably above the 44pt minimum so the
// input is unmistakably tappable. text-base (16px) prevents iOS Safari's
// auto-zoom on focus, which fires whenever an input renders smaller than
// 16px and is one of the worst mobile UX bugs we used to ship.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cn(
        'text-fg placeholder:text-fg-subtle bg-[#0e0f11]/90',
        'h-12 w-full rounded-lg border px-4 text-[16px] shadow-[var(--shadow-well)] sm:text-sm',
        error
          ? 'border-danger/60 focus:ring-danger/30 focus:ring-2 focus-visible:outline-none'
          : 'border-border focus:border-brand/60 hover:border-white/20',
        'transition-all duration-150 ease-in-out',
        'focus:bg-[#121316]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});
