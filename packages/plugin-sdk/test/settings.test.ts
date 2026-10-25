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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  decryptPluginSettings,
  encryptPluginSettings,
  getSecretFieldKeys,
  isMaskedPluginSecret,
  maskPluginSettings,
  PLUGIN_SECRET_MASK,
  PLUGIN_SECRET_PREFIX,
  preparePluginSettings,
} from '../src/settings';

const schema = z.object({
  botToken: z.string().meta({ secret: true }),
  chatId: z.string(),
  dryRun: z.boolean().default(false),
});

describe('plugin settings encryption', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_SECRET;
  });

  it('detects secret fields from zod metadata', () => {
    expect(getSecretFieldKeys(schema)).toEqual(['botToken']);
    expect(getSecretFieldKeys(undefined)).toEqual([]);
  });

  it('encrypts only secret fields and round-trips them', () => {
    const encrypted = encryptPluginSettings(schema, {
      botToken: 'super-secret',
      chatId: '42',
      dryRun: true,
    });

    expect(String(encrypted['botToken'])).toMatch(
      new RegExp(`^${PLUGIN_SECRET_PREFIX.replaceAll(':', '\\:')}`),
    );
    expect(encrypted['botToken']).not.toContain('super-secret');
    expect(encrypted['chatId']).toBe('42');

    const decrypted = decryptPluginSettings(schema, encrypted);
    expect(decrypted['botToken']).toBe('super-secret');
    expect(decrypted['chatId']).toBe('42');
  });

  it('does not double-encrypt an already encrypted value', () => {
    const once = encryptPluginSettings(schema, { botToken: 'token' });
    const twice = encryptPluginSettings(schema, once);
    expect(twice['botToken']).toBe(once['botToken']);
  });

  it('masks secrets for the settings form', () => {
    const masked = maskPluginSettings(schema, { botToken: 'secret', chatId: '42' });
    expect(masked['botToken']).toBe(PLUGIN_SECRET_MASK);
    expect(isMaskedPluginSecret(masked['botToken'])).toBe(true);
    expect(isMaskedPluginSecret('secret')).toBe(false);
  });

  it('drops undecryptable secret values instead of leaking ciphertext', () => {
    const decrypted = decryptPluginSettings(schema, {
      botToken: `${PLUGIN_SECRET_PREFIX}not-a-ciphertext`,
      chatId: '42',
    });
    expect(decrypted).not.toHaveProperty('botToken');
  });

  it('merges partial updates, preserves masked secrets, and applies defaults', () => {
    const prepared = preparePluginSettings({
      schema,
      existing: { botToken: 'kept-secret', chatId: '42' },
      input: { botToken: PLUGIN_SECRET_MASK, chatId: '99' },
    });

    expect(prepared.plain).toEqual({ botToken: 'kept-secret', chatId: '99', dryRun: false });
    expect(prepared.stored['dryRun']).toBe(false);
    expect(String(prepared.stored['botToken'])).toMatch(
      new RegExp(`^${PLUGIN_SECRET_PREFIX.replaceAll(':', '\\:')}`),
    );
    expect(String(prepared.stored['botToken'])).not.toContain('kept-secret');
  });

  it('rejects invalid settings with a Zod error', () => {
    expect(() =>
      preparePluginSettings({ schema, existing: {}, input: { chatId: '42' } }),
    ).toThrowError(/botToken|Invalid input/);
  });

  it('passes through settings when a plugin declares no schema', () => {
    const prepared = preparePluginSettings({
      schema: undefined,
      existing: { a: 1 },
      input: { b: 2 },
    });
    expect(prepared.plain).toEqual({ a: 1, b: 2 });
    expect(prepared.stored).toEqual({ a: 1, b: 2 });
  });

  it('removes explicitly cleared fields', () => {
    const prepared = preparePluginSettings({
      schema,
      existing: { botToken: 'kept', chatId: '42', dryRun: true },
      input: { chatId: '99' },
      clearKeys: ['dryRun'],
    });
    expect(prepared.plain).toEqual({ botToken: 'kept', chatId: '99', dryRun: false });
  });
});
