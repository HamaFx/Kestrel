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

// SPDX-License-Identifier: Apache-2.0

import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { useFieldContext } from '@/components/ui/field';
import { cn } from '@/lib/formatters/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  /** Optional inline field label when Select is used outside `<Field>`. */
  label?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error, label, id, 'aria-describedby': ariaDescribedBy, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldCtx = useFieldContext();
  const resolvedId = id ?? fieldCtx?.id ?? (label ? generatedId : undefined);
  const resolvedDescribedBy = ariaDescribedBy ?? fieldCtx?.describedBy;
  const resolvedError = error ?? fieldCtx?.hasError ?? false;

  const selectEl = (
    <select
      ref={ref}
      id={resolvedId}
      data-slot="select"
      aria-invalid={resolvedError ? 'true' : undefined}
      aria-describedby={resolvedDescribedBy}
      className={cn(
        'surface-well text-fg',
        'h-12 w-full rounded-lg border px-3.5 text-[16px] sm:text-sm',
        resolvedError
          ? 'border-danger/60 focus:ring-danger/30 focus:ring-2 focus-visible:outline-none'
          : 'border-border focus:border-brand/60 hover:border-white/20 focus-visible:ring-brand focus-visible:ring-2 focus-visible:outline-none',
        'transition-all duration-150 ease-in-out',
        'focus:bg-[#121316]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );

  if (label && !fieldCtx) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={resolvedId} className="text-fg-subtle text-body-sm tracking-wide uppercase">
          {label}
        </label>
        {selectEl}
      </div>
    );
  }

  return selectEl;
});
