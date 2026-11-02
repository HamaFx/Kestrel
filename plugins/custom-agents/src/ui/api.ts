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

// Authenticated fetch helpers for the plugin's own HTTP routes.

import { createPluginFetcher, pluginErrorMessage } from '@kestrel/plugin-sdk/ui';

const PLUGIN_ID = 'custom-agents';

export const pluginFetch = createPluginFetcher(PLUGIN_ID);

/** POST a multipart `FormData` body (knowledge uploads). */
export const pluginUpload = pluginFetch.upload;

export const errorMessage = pluginErrorMessage;

export function fmtDate(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
