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

// Small coercion helpers shared by the provider adapters, normalizer, and
// the tool entry point. Kept provider-agnostic: every provider payload is
// untrusted `unknown` until it passes through one of these.

import type { ProviderItem } from './types';

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string').join(' ');
  return '';
}

export function arrayValue(value: unknown): ProviderItem[] {
  return Array.isArray(value) ? (value.filter(isObject) as ProviderItem[]) : [];
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'request aborted or timed out';
    return error.message.slice(0, 180);
  }
  return String(error).slice(0, 180);
}
