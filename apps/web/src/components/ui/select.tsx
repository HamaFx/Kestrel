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

import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cn(
        'text-fg bg-[#0e0f11]/90',
        'h-12 w-full rounded-lg border px-3.5 text-[16px] shadow-[var(--shadow-well)] sm:h-11 sm:text-sm',
        error
          ? 'border-danger/60 focus:ring-danger/30 focus:ring-2 focus-visible:outline-none'
          : 'border-border focus:border-brand/60 hover:border-white/20',
        'transition-all duration-150 ease-in-out',
        'focus:bg-[#121316] focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});
