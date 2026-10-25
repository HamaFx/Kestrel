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

// Server-only settings helpers (AES-256-GCM via @kestrel/shared/encryption).
//
// Kept out of the package root because the main entrypoint must stay
// importable from non-server contexts (worker, plugin authoring, tests).

import { decryptSecret, encryptSecret } from '@kestrel/shared/encryption';
import type { z } from 'zod';

import { PLUGIN_SECRET_MASK, PLUGIN_SECRET_PREFIX } from './constants';

export { PLUGIN_SECRET_MASK, PLUGIN_SECRET_PREFIX };

type SettingsSchema = z.ZodObject<z.ZodRawShape> | undefined;

/**
 * Field names whose schema carries `.meta({ secret: true })`.
 *
 * Zod v4 exposes field metadata through `.meta()`. Non-object schemas (or
 * older schemas without metadata) yield an empty list, meaning nothing is
 * encrypted.
 */
export function getSecretFieldKeys(schema: SettingsSchema): string[] {
  if (!schema || typeof schema.shape !== 'object' || schema.shape === null) return [];
  const keys: string[] = [];
  for (const [key, field] of Object.entries(schema.shape)) {
    const meta = (field as { meta?: () => Record<string, unknown> | undefined }).meta?.();
    if (meta?.['secret'] === true) keys.push(key);
  }
  return keys;
}

/**
 * Encrypt secret fields before persisting `user_installed_plugins.settings`.
 * Empty strings and already-encrypted values are left untouched.
 */
export function encryptPluginSettings(
  schema: SettingsSchema,
  settings: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...settings };
  for (const key of getSecretFieldKeys(schema)) {
    const value = result[key];
    if (typeof value !== 'string' || value.length === 0) continue;
    if (value.startsWith(PLUGIN_SECRET_PREFIX)) continue;
    result[key] = `${PLUGIN_SECRET_PREFIX}${encryptSecret(value)}`;
  }
  return result;
}

/**
 * Decrypt secret fields for plugin execution. Undecryptable values are
 * dropped rather than leaked or silently used as ciphertext.
 */
export function decryptPluginSettings(
  schema: SettingsSchema,
  settings: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...settings };
  for (const key of getSecretFieldKeys(schema)) {
    const value = result[key];
    if (typeof value !== 'string') continue;
    if (!value.startsWith(PLUGIN_SECRET_PREFIX)) continue;
    const decrypted = decryptSecret(value.slice(PLUGIN_SECRET_PREFIX.length));
    if (decrypted === null) {
      delete result[key];
      continue;
    }
    result[key] = decrypted;
  }
  return result;
}

/**
 * Mask secret fields for a settings form. The UI shows a placeholder and
 * only submits a secret when the user replaces it.
 */
export function maskPluginSettings(
  schema: SettingsSchema,
  settings: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...settings };
  for (const key of getSecretFieldKeys(schema)) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) {
      result[key] = PLUGIN_SECRET_MASK;
    }
  }
  return result;
}

/** True when `value` is the masked placeholder rather than a real secret. */
export function isMaskedPluginSecret(value: unknown): boolean {
  return value === PLUGIN_SECRET_MASK;
}

export interface PreparePluginSettingsArgs {
  schema: SettingsSchema;
  /**
   * Existing settings in plaintext (already decrypted). Used to preserve
   * fields the form did not submit and to keep a stored secret when the UI
   * sends back its mask placeholder.
   */
  existing?: Readonly<Record<string, unknown>>;
  /** Partial settings submitted by the form (or by a setup action). */
  input: Readonly<Record<string, unknown>>;
  /** Field names to delete (e.g. an unlinked Telegram chat id). */
  clearKeys?: readonly string[];
}

export interface PreparedPluginSettings {
  /** Encrypted-at-rest payload ready for `user_installed_plugins.settings`. */
  stored: Record<string, unknown>;
  /** Validated plaintext payload, for the install/uninstall lifecycle hooks. */
  plain: Record<string, unknown>;
}

/**
 * Merge a partial settings submission into the existing plaintext settings,
 * apply defaults and validation from the plugin's schema, then encrypt the
 * secret fields.
 *
 * A masked placeholder is ignored so saving a form cannot overwrite a stored
 * secret with `••••••••`. Unknown keys are stripped by `z.object` parsing.
 */
export function preparePluginSettings({
  schema,
  existing,
  input,
  clearKeys,
}: PreparePluginSettingsArgs): PreparedPluginSettings {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };

  for (const key of clearKeys ?? []) {
    delete merged[key];
  }

  for (const [key, value] of Object.entries(input)) {
    if (isMaskedPluginSecret(value)) continue;
    if (value === undefined) continue;
    merged[key] = value;
  }

  const plain = schema
    ? (schema.parse(merged) as Record<string, unknown>)
    : (merged as Record<string, unknown>);

  return { stored: encryptPluginSettings(schema, plain), plain };
}
