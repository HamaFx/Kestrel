'use client';

// SPDX-License-Identifier: Apache-2.0

// Per-descriptor control renderer: boolean switch, enum select, JSON, number,
// and string/secret/multiline inputs.
import { PLUGIN_SECRET_MASK, type PluginSettingsFieldDescriptor } from '@kestrel/plugin-sdk';
import { IconLock } from '@tabler/icons-react';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/formatters/cn';

import { JsonField } from './json-field';
import { SecretInput } from './secret-input';

export function PluginFieldControl({
  field,
  id,
  value,
  error,
  disabled,
  helperId,
  onChange,
}: {
  field: PluginSettingsFieldDescriptor;
  id: string;
  value: unknown;
  error: string | undefined;
  disabled?: boolean;
  helperId: string | undefined;
  onChange: (value: unknown) => void;
}) {
  const rawValue = value;

  if (field.type === 'boolean') {
    const checked = typeof rawValue === 'boolean' ? rawValue : Boolean(field.defaultValue ?? false);
    return (
      <div className="flex items-start justify-between gap-4">
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
          onCheckedChange={(next) => onChange(next)}
        />
      </div>
    );
  }

  if (field.type === 'enum') {
    return (
      <Field
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
          onChange={(event) => onChange(event.target.value)}
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
          onChange={(next) => onChange(next)}
        />
      </Field>
    );
  }

  if (field.type === 'number' || field.type === 'integer') {
    return (
      <Field
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
            Stored securely. Leave this placeholder unchanged to keep the current value, or type a
            new one to replace it.
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
          onChange={(event) => onChange(event.target.value)}
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
          onChange={(next) => onChange(next)}
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
          onChange={(event) => onChange(event.target.value)}
          className={field.format === 'uri' ? 'font-mono text-sm' : undefined}
        />
      )}
    </Field>
  );
}
