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

// AutoZodSettingsForm — renders a plugin's settings schema without bespoke
// form code. The server serialises Zod into `PluginSettingsFieldDescriptor[]`
// (see packages/plugin-sdk/src/settings-schema.ts); this component picks the
// matching Hoplite control for each descriptor.
//
// Secret values arrive as `PLUGIN_SECRET_MASK`. Leaving the mask untouched
// keeps the stored secret; typing a new value replaces it.
import { PLUGIN_SECRET_MASK, type PluginSettingsFieldDescriptor } from '@kestrel/plugin-sdk';
import { IconEye, IconEyeOff, IconLock } from '@tabler/icons-react';
import { useId, useState } from 'react';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/formatters/cn';

export type PluginSettingsValues = Record<string, unknown>;

export interface AutoZodSettingsFormProps {
  fields: readonly PluginSettingsFieldDescriptor[];
  values: PluginSettingsValues;
  onChange: (key: string, value: unknown) => void;
  errors?: Readonly<Record<string, string>> | undefined;
  disabled?: boolean;
  /** Optional subset — used by the guided setup drawer per step. */
  onlyKeys?: readonly string[];
}

function JsonField({
  id,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  error?: string | undefined;
}) {
  const initial = typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
  const [draft, setDraft] = useState(initial);
  const [parseError, setParseError] = useState<string | null>(null);

  function commit(next: string) {
    setDraft(next);
    if (next.trim().length === 0) {
      setParseError(null);
      onChange(undefined);
      return;
    }
    try {
      onChange(JSON.parse(next));
      setParseError(null);
    } catch {
      setParseError('Enter valid JSON');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        id={id}
        value={draft}
        disabled={disabled}
        spellCheck={false}
        rows={5}
        onChange={(event) => commit(event.target.value)}
        className={cn(
          'bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:bg-bg-elev-1/80',
          'w-full rounded-sm border px-4 py-3 font-mono text-sm',
          error || parseError
            ? 'border-danger/60 focus:ring-danger/30 focus:ring-2 focus:outline-none'
            : 'border-border focus:outline-none',
        )}
      />
      {(error || parseError) && (
        <p role="alert" className="text-danger text-xs">
          {parseError ?? error}
        </p>
      )}
    </div>
  );
}

function SecretInput({
  id,
  value,
  placeholder,
  disabled,
  error,
  describedBy,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string | undefined;
  disabled?: boolean;
  error?: boolean;
  describedBy?: string | undefined;
  onChange: (value: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={reveal ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        error={error}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className="pr-12 font-mono"
      />
      <button
        type="button"
        onClick={() => setReveal((current) => !current)}
        disabled={disabled}
        aria-label={reveal ? 'Hide secret' : 'Reveal secret'}
        className="text-fg-subtle hover:text-fg absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors"
      >
        {reveal ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
    </div>
  );
}

export function AutoZodSettingsForm({
  fields,
  values,
  onChange,
  errors,
  disabled,
  onlyKeys,
}: AutoZodSettingsFormProps) {
  const groupId = useId();
  const visible = onlyKeys ? fields.filter((field) => onlyKeys.includes(field.key)) : fields;

  if (visible.length === 0) {
    return (
      <p className="text-fg-subtle text-sm">
        This plugin has no settings. You can finish setup right away.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {visible.map((field) => {
        const id = `${groupId}-${field.key}`;
        const error = errors?.[field.key];
        const helperId = field.description ? `${id}-helper` : undefined;
        const rawValue = values[field.key];

        if (field.type === 'boolean') {
          const checked =
            typeof rawValue === 'boolean' ? rawValue : Boolean(field.defaultValue ?? false);
          return (
            <div key={field.key} className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={id} className="text-fg text-sm font-semibold">
                  {field.label}
                </label>
                {field.description ? (
                  <p id={`${id}-helper`} className="text-fg-subtle text-xs">
                    {field.description}
                  </p>
                ) : null}
              </div>
              <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                srLabel={field.label}
                onCheckedChange={(next) => onChange(field.key, next)}
              />
            </div>
          );
        }

        if (field.type === 'enum') {
          return (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={id}
              error={error}
              required={field.required}
              helper={field.description}
            >
              <select
                id={id}
                value={typeof rawValue === 'string' ? rawValue : String(field.defaultValue ?? '')}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="bg-bg-elev-1/60 text-fg border-border focus:bg-bg-elev-1/80 h-12 w-full rounded-sm border px-4 text-sm focus:outline-none"
              >
                {field.options?.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          );
        }

        if (field.type === 'json') {
          return (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={id}
              error={error}
              required={field.required}
              helper={field.description}
            >
              <JsonField
                id={id}
                value={rawValue}
                disabled={disabled}
                error={error}
                onChange={(next) => onChange(field.key, next)}
              />
            </Field>
          );
        }

        if (field.type === 'number' || field.type === 'integer') {
          return (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={id}
              error={error}
              required={field.required}
              helper={field.description}
            >
              <Input
                id={id}
                type="number"
                inputMode={field.type === 'integer' ? 'numeric' : 'decimal'}
                step={field.type === 'integer' ? 1 : 'any'}
                min={field.minimum}
                max={field.maximum}
                value={
                  typeof rawValue === 'number' || typeof rawValue === 'string'
                    ? rawValue
                    : typeof field.defaultValue === 'number'
                      ? field.defaultValue
                      : ''
                }
                disabled={disabled}
                error={Boolean(error)}
                onChange={(event) => {
                  const next = event.target.value;
                  onChange(
                    field.key,
                    next === ''
                      ? undefined
                      : field.type === 'integer'
                        ? Number.parseInt(next, 10)
                        : Number(next),
                  );
                }}
                className="font-mono tabular-nums"
              />
            </Field>
          );
        }

        const isSecret = field.secret;
        const stringValue = typeof rawValue === 'string' ? rawValue : '';
        const isMasked = isSecret && stringValue === PLUGIN_SECRET_MASK;
        const multiline = field.multiline === true;

        return (
          <Field
            key={field.key}
            label={
              <span className="inline-flex items-center gap-1.5">
                {field.label}
                {isSecret ? <IconLock className="size-3" aria-hidden /> : null}
              </span>
            }
            htmlFor={id}
            error={error}
            required={field.required}
            helper={
              isMasked ? (
                <span>
                  Stored securely. Leave this placeholder unchanged to keep the current value, or
                  type a new one to replace it.
                </span>
              ) : (
                field.description
              )
            }
          >
            {multiline ? (
              <textarea
                id={id}
                value={stringValue}
                placeholder={field.placeholder}
                disabled={disabled}
                rows={4}
                spellCheck={false}
                aria-describedby={helperId}
                onChange={(event) => onChange(field.key, event.target.value)}
                className={cn(
                  'bg-bg-elev-1/60 text-fg border-border focus:bg-bg-elev-1/80 w-full rounded-sm border px-4 py-3 text-sm focus:outline-none',
                  error && 'border-danger/60',
                )}
              />
            ) : isSecret ? (
              <SecretInput
                id={id}
                value={stringValue}
                placeholder={field.placeholder}
                disabled={disabled}
                error={Boolean(error)}
                describedBy={helperId}
                onChange={(next) => onChange(field.key, next)}
              />
            ) : (
              <Input
                id={id}
                type="text"
                value={stringValue}
                placeholder={field.placeholder}
                disabled={disabled}
                error={Boolean(error)}
                spellCheck={false}
                aria-describedby={helperId}
                onChange={(event) => onChange(field.key, event.target.value)}
                className={field.format === 'uri' ? 'font-mono text-sm' : undefined}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
