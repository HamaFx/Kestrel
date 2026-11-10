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

// <Field> — accessible form field wrapper inspired by PanelUI's Field primitive.
// Wires `<label htmlFor>`, helper description, and error feedback (`role="alert"`)
// via React context so controls works seamlessly whether rendered bare (`<Input>`)
// or nested inside `<InputGroup>` / custom wrappers. Automatically hides the
// helper description while an error message is active to prevent vertical jitter.

import { cloneElement, createContext, isValidElement, useContext, type ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  hasError: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  error?: string | null | undefined;
  required?: boolean | undefined;
  helper?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  error,
  required = false,
  helper,
  children,
  className,
}: FieldProps) {
  const hasError = Boolean(error && error.trim().length > 0);
  const errorId = hasError ? `${htmlFor}-error` : undefined;
  const showHelper = !hasError && Boolean(helper);
  const helperId = showHelper ? `${htmlFor}-helper` : undefined;
  const describedBy = errorId ?? helperId;

  // Fallback clone for raw native elements (<select>, <textarea>) that do not
  // consume FieldContext directly.
  const control = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children)
    ? cloneElement(children, {
        id: children.props.id ?? htmlFor,
        ...(describedBy && !children.props['aria-describedby']
          ? { 'aria-describedby': describedBy }
          : {}),
      })
    : children;

  return (
    <FieldContext.Provider value={{ id: htmlFor, describedBy, hasError }}>
      <div
        data-slot="field"
        data-invalid={hasError || undefined}
        className={cn('flex flex-col gap-2', className)}
      >
        <label
          data-slot="field-label"
          htmlFor={htmlFor}
          className="text-fg-subtle text-body-sm tracking-wide uppercase"
        >
          {label}
          {required ? (
            <span className="text-danger ml-1" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {control}
        {showHelper ? (
          <p id={helperId} data-slot="field-description" className="text-fg-subtle text-xs">
            {helper}
          </p>
        ) : null}
        {hasError ? (
          <p id={errorId} data-slot="field-error" role="alert" className="text-danger text-xs">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
