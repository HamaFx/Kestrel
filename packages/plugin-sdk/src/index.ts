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

import type { KestrelPlugin } from './types';

export * from './types';
export { PLUGIN_SECRET_MASK, PLUGIN_SECRET_PREFIX } from './constants';
export {
  describePluginSettingsSchema,
  type PluginSettingsFieldDescriptor,
  type PluginSettingsFieldOption,
  type PluginSettingsFieldType,
  type PluginSettingsSchemaDescription,
} from './settings-schema';
export { PluginHost, pluginHost, type RegisteredPlugin, type ResolveToolsOptions } from './host';

/**
 * Define a plugin with full type inference.
 *
 * Registration-time validation (duplicate ids, reserved tool names, schema
 * presence) happens in `PluginHost.register()` so a plugin can be authored,
 * tested, and imported without touching the host singleton.
 */
export function definePlugin<const T extends KestrelPlugin>(plugin: T): T {
  return plugin;
}
