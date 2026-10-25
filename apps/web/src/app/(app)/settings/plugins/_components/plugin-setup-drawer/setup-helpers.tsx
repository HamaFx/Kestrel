// SPDX-License-Identifier: Apache-2.0

// Helpers for the guided plugin-setup drawer: default values, field-error
// extraction, secret masking checks, and link template expansion.

import { PLUGIN_SECRET_MASK, type PluginSetupStep } from '@kestrel/plugin-sdk';
import {
  IconCheck,
  IconExternalLink,
  IconPlugConnected,
  IconShieldLock,
} from '@tabler/icons-react';

import { ApiError } from '@/lib/http/api-client';
import type { PluginStoreEntry } from '@/lib/plugins/types';

import type { PluginSettingsValues } from '../auto-zod-settings-form';

export interface SetupActionResponse {
  ok?: boolean;
  message?: string;
  values?: Record<string, unknown>;
  url?: string;
  error?: { message?: string };
}

export function initialValues(entry: PluginStoreEntry | null): PluginSettingsValues {
  if (!entry) return {};
  const values: PluginSettingsValues = {};
  for (const field of entry.settingsFields) {
    if (field.defaultValue !== undefined) values[field.key] = field.defaultValue;
  }
  return { ...values, ...entry.settings };
}

export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (error instanceof ApiError && error.details && typeof error.details === 'object') {
    const flatten = error.details as {
      fieldErrors?: Record<string, string[] | undefined>;
    };
    if (flatten.fieldErrors) {
      return Object.fromEntries(
        Object.entries(flatten.fieldErrors)
          .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
          .map(([key, messages]) => [key, String(messages?.[0] ?? 'Invalid value')]),
      );
    }
  }
  return {};
}

export function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0 || value === PLUGIN_SECRET_MASK;
  }
  return true;
}

export function expandUrl(template: string, values: PluginSettingsValues): string {
  const whole = /^\{([a-zA-Z0-9_]+)\}$/.exec(template.trim());
  if (whole) {
    const value = values[whole[1] ?? ''];
    return value === undefined || value === null ? '' : String(value);
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? '' : encodeURIComponent(String(value));
  });
}

export function StepIcon({ kind }: { kind: PluginSetupStep['kind'] }) {
  if (kind === 'credentials') return <IconShieldLock className="size-4" />;
  if (kind === 'action') return <IconPlugConnected className="size-4" />;
  if (kind === 'link') return <IconExternalLink className="size-4" />;
  return <IconCheck className="size-4" />;
}
