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

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { describePluginSettingsSchema } from '../src/settings-schema';

describe('describePluginSettingsSchema', () => {
  it('maps primitives, defaults, enums, and metadata into form descriptors', () => {
    const schema = z.object({
      botToken: z
        .string()
        .min(1)
        .meta({ secret: true, label: 'Bot token', description: 'From BotFather' }),
      risk: z.number().min(0).max(100).default(1),
      enabled: z.boolean().default(true),
      mode: z.enum(['confirm', 'autonomous']).default('confirm'),
      notes: z.string().meta({ multiline: true }).optional(),
      retries: z.int().min(1).max(5).default(2),
    });

    const description = describePluginSettingsSchema(schema);
    const byKey = Object.fromEntries(description.fields.map((field) => [field.key, field]));

    expect(byKey['botToken']).toMatchObject({
      type: 'string',
      required: true,
      secret: true,
      label: 'Bot token',
      description: 'From BotFather',
    });
    expect(byKey['risk']).toMatchObject({
      type: 'number',
      required: false,
      minimum: 0,
      maximum: 100,
      defaultValue: 1,
    });
    expect(byKey['enabled']).toMatchObject({ type: 'boolean', defaultValue: true });
    expect(byKey['mode']).toMatchObject({
      type: 'enum',
      defaultValue: 'confirm',
      options: [
        { value: 'confirm', label: 'confirm' },
        { value: 'autonomous', label: 'autonomous' },
      ],
    });
    expect(byKey['notes']).toMatchObject({ type: 'string', multiline: true, required: false });
    expect(byKey['retries']).toMatchObject({ type: 'integer', required: false });
  });

  it('supports option labels supplied through metadata', () => {
    const schema = z.object({
      mode: z.enum(['a', 'b']).meta({
        optionLabels: { a: 'Alpha', b: 'Beta' },
      }),
    });

    const [field] = describePluginSettingsSchema(schema).fields;
    expect(field?.options).toEqual([
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
  });

  it('returns an empty description when no schema is declared', () => {
    expect(describePluginSettingsSchema(undefined)).toEqual({ fields: [], jsonSchema: null });
  });

  it('omits system-managed hidden fields', () => {
    const schema = z.object({
      botToken: z.string().meta({ secret: true }),
      linkedChatId: z.string().optional().meta({ hidden: true }),
      webhookSecret: z.string().optional().meta({ hidden: true, secret: true }),
    });

    expect(describePluginSettingsSchema(schema).fields.map((field) => field.key)).toEqual([
      'botToken',
    ]);
  });
});
