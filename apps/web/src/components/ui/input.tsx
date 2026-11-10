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

// Milled Kestrel Input + PanelUI-style InputGroup & InputAddon composition.
// Standalone `<Input>` renders its own recessed `surface-well` bezel and focus ring.
// Inside `<InputGroup>`, `<Input>` drops its chrome (`in-data-[slot=input-group]:*`)
// so the group draws a single unified bezel and focus ring around the input and
// any leading/trailing `<InputAddon>` icons, units, or action buttons.

import { forwardRef, type HTMLAttributes, type InputHTMLAttributes } from 'react';

import { useFieldContext } from '@/components/ui/field';
import { cn } from '@/lib/formatters/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, id, 'aria-describedby': ariaDescribedBy, ...rest },
  ref,
) {
  const fieldCtx = useFieldContext();
  const resolvedId = id ?? fieldCtx?.id;
  const resolvedDescribedBy = ariaDescribedBy ?? fieldCtx?.describedBy;
  const resolvedError = error ?? fieldCtx?.hasError ?? false;

  return (
    <input
      ref={ref}
      id={resolvedId}
      data-slot="input"
      aria-invalid={resolvedError ? 'true' : undefined}
      aria-describedby={resolvedDescribedBy}
      className={cn(
        'text-fg placeholder:text-fg-subtle w-full text-[16px] sm:text-sm',
        'transition-all duration-150 ease-in-out',
        'disabled:cursor-not-allowed disabled:opacity-60',
        // Standalone chrome (collapses automatically inside InputGroup)
        'not-in-data-[slot=input-group]:surface-well not-in-data-[slot=input-group]:h-12 not-in-data-[slot=input-group]:rounded-lg not-in-data-[slot=input-group]:px-4 not-in-data-[slot=input-group]:focus:bg-[#121316]',
        resolvedError
          ? 'not-in-data-[slot=input-group]:border-danger/60 not-in-data-[slot=input-group]:focus:ring-danger/30 not-in-data-[slot=input-group]:focus:ring-2 not-in-data-[slot=input-group]:focus-visible:outline-none'
          : 'not-in-data-[slot=input-group]:border-border not-in-data-[slot=input-group]:hover:border-white/20 not-in-data-[slot=input-group]:focus:border-brand/60',
        // Grouped chrome (inside InputGroup)
        'in-data-[slot=input-group]:h-full in-data-[slot=input-group]:min-w-0 in-data-[slot=input-group]:flex-1 in-data-[slot=input-group]:border-0 in-data-[slot=input-group]:bg-transparent in-data-[slot=input-group]:px-3.5 in-data-[slot=input-group]:shadow-none in-data-[slot=input-group]:focus:bg-transparent in-data-[slot=input-group]:focus:ring-0 in-data-[slot=input-group]:focus-visible:outline-none',
        className,
      )}
      {...rest}
    />
  );
});

interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  error?: boolean;
}

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(function InputGroup(
  { className, error, ...rest },
  ref,
) {
  const fieldCtx = useFieldContext();
  const resolvedError = error ?? fieldCtx?.hasError ?? false;

  return (
    <div
      ref={ref}
      data-slot="input-group"
      data-invalid={resolvedError || undefined}
      className={cn(
        'surface-well text-fg relative flex h-12 w-full items-center rounded-lg border transition-all duration-150 ease-in-out',
        resolvedError
          ? 'border-danger/60 focus-within:ring-danger/30 focus-within:ring-2'
          : 'border-border hover:border-white/20 focus-within:border-brand/60 focus-within:ring-brand focus-within:ring-2',
        'focus-within:bg-[#121316]',
        'has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60',
        '[&>[data-slot=input-addon]:first-child+[data-slot=input]]:pl-2',
        '[&>[data-slot=input]:has(+[data-slot=input-addon])]:pr-2',
        className,
      )}
      {...rest}
    />
  );
});

export const InputAddon = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function InputAddon({ className, onMouseDown, ...rest }, ref) {
    return (
      <div
        ref={ref}
        data-slot="input-addon"
        onMouseDown={(event) => {
          onMouseDown?.(event);
          if (event.defaultPrevented) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest('button, a, input, select, textarea')) return;
          const input = event.currentTarget
            .closest('[data-slot="input-group"]')
            ?.querySelector<HTMLInputElement>('input');
          if (input && !input.disabled) {
            event.preventDefault();
            input.focus();
          }
        }}
        className={cn(
          'text-fg-subtle flex shrink-0 items-center gap-1 text-xs select-none',
          'first:pl-3.5 last:pr-2.5',
          className,
        )}
        {...rest}
      />
    );
  },
);
