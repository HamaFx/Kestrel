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
import type { PluginSettingsFieldDescriptor } from '@kestrel/plugin-sdk';
import { useId } from 'react';

import { PluginFieldControl } from './field-control';

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

        return (
          <PluginFieldControl
            key={field.key}
            field={field}
            id={id}
            value={values[field.key]}
            error={error}
            disabled={disabled}
            helperId={helperId}
            onChange={(next) => onChange(field.key, next)}
          />
        );
      })}
    </div>
  );
}
