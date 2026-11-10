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

import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { useFieldContext } from '@/components/ui/field';
import { cn } from '@/lib/formatters/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, id, 'aria-describedby': ariaDescribedBy, ...rest },
  ref,
) {
  const fieldCtx = useFieldContext();
  const resolvedId = id ?? fieldCtx?.id;
  const resolvedDescribedBy = ariaDescribedBy ?? fieldCtx?.describedBy;
  const resolvedError = error ?? fieldCtx?.hasError ?? false;

  return (
    <textarea
      ref={ref}
      id={resolvedId}
      data-slot="textarea"
      aria-invalid={resolvedError ? 'true' : undefined}
      aria-describedby={resolvedDescribedBy}
      className={cn(
        'surface-well text-fg placeholder:text-fg-subtle',
        'min-h-[96px] w-full rounded-lg border px-4 py-3 text-[16px] sm:text-sm',
        resolvedError
          ? 'border-danger/60 focus:ring-danger/30 focus:ring-2 focus-visible:outline-none'
          : 'border-border focus:border-brand/60 hover:border-white/20 focus-visible:ring-brand focus-visible:ring-2 focus-visible:outline-none',
        'transition-all duration-150 ease-in-out',
        'focus:bg-[#121316]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});
