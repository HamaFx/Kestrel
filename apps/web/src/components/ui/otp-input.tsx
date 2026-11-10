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

// <OtpInput> — PanelUI-inspired 6-cell hardware keycap TOTP input.
// Overlays a single real `<input autoComplete="one-time-code">` across 6 visual
// `.surface-well` cells so native password-manager autofill, clipboard paste,
// and standard `<form action>` FormData serialization (`name="totpCode"`) work
// identically in both controlled and uncontrolled forms.

import { forwardRef, useState, type InputHTMLAttributes } from 'react';

import { useFieldContext } from '@/components/ui/field';
import { cn } from '@/lib/formatters/cn';

interface OtpInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'defaultValue'> {
  length?: number;
  groupEvery?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
}

export const OtpInput = forwardRef<HTMLInputElement, OtpInputProps>(function OtpInput(
  {
    length = 6,
    groupEvery = 3,
    value: controlledValue,
    defaultValue = '',
    onValueChange,
    onChange,
    onComplete,
    error,
    disabled,
    readOnly,
    id,
    className,
    'aria-describedby': ariaDescribedBy,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const fieldCtx = useFieldContext();
  const resolvedId = id ?? fieldCtx?.id;
  const resolvedDescribedBy = ariaDescribedBy ?? fieldCtx?.describedBy;
  const resolvedError = error ?? fieldCtx?.hasError ?? false;

  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);

  const isControlled = controlledValue !== undefined;
  const currentValue = (isControlled ? controlledValue : uncontrolledValue).slice(0, length);
  const activeIndex = Math.min(currentValue.length, length - 1);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = event.target.value.replace(/\D/g, '').slice(0, length);
    if (event.target.value !== sanitized) {
      event.target.value = sanitized;
    }
    if (!isControlled) {
      setUncontrolledValue(sanitized);
    }
    onValueChange?.(sanitized);
    onChange?.(event);
    if (sanitized.length === length) {
      onComplete?.(sanitized);
    }
  };

  return (
    <div
      data-slot="otp-input"
      data-disabled={disabled || undefined}
      data-invalid={resolvedError || undefined}
      className={cn(
        'relative inline-flex w-fit items-center gap-1.5 select-none',
        disabled && 'opacity-60',
        className,
      )}
    >
      <input
        ref={ref}
        id={resolvedId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={length}
        value={currentValue}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={resolvedError ? 'true' : undefined}
        aria-describedby={resolvedDescribedBy}
        onChange={handleChange}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
        {...rest}
      />

      {Array.from({ length }, (_, index) => {
        const char = currentValue[index] ?? '';
        const isCurrent = focused && !disabled && !readOnly && index === activeIndex;
        const isFilled = char.length > 0;
        const showGroupDivider = groupEvery > 0 && index > 0 && index % groupEvery === 0;

        return (
          <div key={index} className="inline-flex items-center gap-1.5">
            {showGroupDivider ? (
              <span
                aria-hidden="true"
                className="text-fg-subtle/50 px-0.5 font-mono text-xs font-bold"
              >
                —
              </span>
            ) : null}
            <div
              aria-hidden="true"
              data-slot="otp-cell"
              data-active={isCurrent || undefined}
              data-filled={isFilled || undefined}
              className={cn(
                'surface-well text-fg relative flex h-11 w-9 items-center justify-center rounded-lg border font-mono text-base font-bold tabular-nums transition-all duration-150 sm:w-10',
                resolvedError
                  ? 'border-danger/60 text-danger'
                  : isCurrent
                    ? 'border-brand ring-brand/35 bg-[#121316] ring-2'
                    : isFilled
                      ? 'border-white/20 bg-[#121316]'
                      : 'border-border',
              )}
            >
              {char}
              {isCurrent && !isFilled ? (
                <span className="bg-brand h-4 w-0.5 animate-pulse rounded-full" />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
});
