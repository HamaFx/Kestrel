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

// Auto-generated settings forms.
//
// A plugin declares its per-user settings as a Zod object. The Plugin Store
// turns that schema into a serialisable field list so the browser can render
// the correct Hoplite control without shipping the Zod schema (or any server
// code) to the client.
//
// Zod v4's `toJSONSchema({ io: 'input' })` preserves `.meta()` entries, so
// `.meta({ secret: true, label: 'Bot token' })` flows through unchanged.

import { z } from 'zod';

export type PluginSettingsFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'json';

export interface PluginSettingsFieldOption {
  value: string | number | boolean;
  label: string;
}

export interface PluginSettingsFieldDescriptor {
  key: string;
  label: string;
  description?: string;
  type: PluginSettingsFieldType;
  required: boolean;
  /** Secret fields are encrypted at rest and masked in every response. */
  secret: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  options?: readonly PluginSettingsFieldOption[];
  minimum?: number;
  maximum?: number;
  format?: string;
  multiline?: boolean;
}

export interface PluginSettingsSchemaDescription {
  fields: readonly PluginSettingsFieldDescriptor[];
  /** Raw JSON schema for advanced consumers. Null when introspection failed. */
  jsonSchema: Record<string, unknown> | null;
  /** Present only when Zod could not represent the schema. */
  error?: string;
}

type JsonSchema = Record<string, unknown>;

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (spaced.length === 0) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function asRecord(value: unknown): JsonSchema | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonSchema)
    : null;
}

function pickSchemaType(schema: JsonSchema): JsonSchema {
  const type = schema['type'];
  if (typeof type === 'string') return schema;

  // Nullable / optional unions are represented as anyOf or oneOf. Use the
  // first non-null branch — the form only needs one concrete control.
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const branches = schema[keyword];
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        const record = asRecord(branch);
        if (!record) continue;
        if (record['type'] === 'null') continue;
        return { ...schema, ...record, type: record['type'] };
      }
    }
  }
  return schema;
}

function enumOptions(schema: JsonSchema): PluginSettingsFieldOption[] | undefined {
  const values = schema['enum'];
  if (!Array.isArray(values) || values.length === 0) return undefined;

  const labels = schema['optionLabels'];

  return values
    .filter(
      (value): value is string | number | boolean =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    )
    .map((value) => {
      if (Array.isArray(labels)) {
        const index = values.indexOf(value);
        const label = labels[index];
        return { value, label: typeof label === 'string' ? label : String(value) };
      }
      if (labels !== null && typeof labels === 'object') {
        const label = (labels as Record<string, unknown>)[String(value)];
        return { value, label: typeof label === 'string' ? label : String(value) };
      }
      return { value, label: String(value) };
    });
}

function fieldType(schema: JsonSchema): PluginSettingsFieldType {
  const raw = schema['type'];
  const type = Array.isArray(raw) ? raw.find((entry) => entry !== 'null') : raw;

  if (Array.isArray(schema['enum']) && schema['enum'].length > 0) return 'enum';
  if (type === 'integer') return 'integer';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'string') return 'string';
  return 'json';
}

function descriptorForKey(
  key: string,
  inputSchema: unknown,
  required: boolean,
): PluginSettingsFieldDescriptor {
  const schema = pickSchemaType(asRecord(inputSchema) ?? {});
  const type = fieldType(schema);

  const label =
    typeof schema['label'] === 'string'
      ? schema['label']
      : typeof schema['title'] === 'string'
        ? schema['title']
        : humanizeKey(key);

  const description =
    typeof schema['description'] === 'string'
      ? schema['description']
      : typeof schema['help'] === 'string'
        ? schema['help']
        : undefined;

  const widget = typeof schema['widget'] === 'string' ? schema['widget'] : undefined;
  const multiline =
    schema['multiline'] === true || widget === 'textarea' || schema['format'] === 'textarea';

  const descriptor: PluginSettingsFieldDescriptor = {
    key,
    label,
    type,
    required,
    secret: schema['secret'] === true,
    ...(description !== undefined ? { description } : {}),
    ...(schema['default'] !== undefined ? { defaultValue: schema['default'] } : {}),
    ...(typeof schema['placeholder'] === 'string' ? { placeholder: schema['placeholder'] } : {}),
    ...(typeof schema['minimum'] === 'number' ? { minimum: schema['minimum'] } : {}),
    ...(typeof schema['maximum'] === 'number' ? { maximum: schema['maximum'] } : {}),
    ...(typeof schema['format'] === 'string' && schema['format'] !== 'textarea'
      ? { format: schema['format'] }
      : {}),
    ...(multiline ? { multiline: true } : {}),
  };

  if (type === 'enum') {
    const options = enumOptions(schema);
    if (options) descriptor.options = options;
  }

  return descriptor;
}

/**
 * Describe a plugin's settings schema for the Store's auto-form.
 *
 * Never throws: a schema Zod cannot represent renders as an empty field list
 * with `error` set, so the Store still shows the plugin card.
 */
export function describePluginSettingsSchema(
  schema: z.ZodType | undefined,
): PluginSettingsSchemaDescription {
  if (!schema) return { fields: [], jsonSchema: null };

  let jsonSchema: JsonSchema;
  try {
    jsonSchema = z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
      // Keep the output small: the form only reads properties/required.
      cycles: 'ref',
    }) as JsonSchema;
  } catch (err) {
    return {
      fields: [],
      jsonSchema: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const properties = asRecord(jsonSchema['properties']);
  if (!properties) return { fields: [], jsonSchema };

  const required = new Set(
    Array.isArray(jsonSchema['required'])
      ? jsonSchema['required'].filter((key): key is string => typeof key === 'string')
      : [],
  );

  const fields = Object.entries(properties)
    // System-managed fields (webhook secrets, linked chat ids, …) are stored
    // in settings but never rendered or submitted by the settings form.
    .filter(([, value]) => asRecord(value)?.['hidden'] !== true)
    .map(([key, value]) => descriptorForKey(key, value, required.has(key)));

  return { fields, jsonSchema };
}
