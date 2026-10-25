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

// UI half of the plugin contract.
//
// This entrypoint is client-safe: it imports React *types* only and never
// pulls Node built-ins or server modules. Plugin packages with custom chat
// cards / widgets / pages export a `PluginUiDefinition` from their
// `src/ui/index.tsx`, and the web app registers it once at boot.
//
// Split by component group: slot contracts in `./slots`, the exported
// definition + registered shapes in `./definition`, and the registry in
// `./registry`. Every name the `@kestrel/plugin-sdk/ui` subpath used to
// export is re-exported here, and `pluginUiRegistry` stays a single global.

export type {
  PluginDashboardWidget,
  PluginDashboardWidgetProps,
  PluginNavItem,
  PluginPageProps,
  PluginPageRegistration,
  PluginSetupWizardProps,
  PluginSlashCommand,
  PluginToolPartProps,
  PluginToolPartRegistration,
} from './slots';
export {
  definePluginUi,
  type PluginUiDefinition,
  type RegisteredDashboardWidget,
  type RegisteredNavItem,
  type RegisteredSlashCommand,
} from './definition';
export { PluginUiRegistry, pluginUiRegistry } from './registry';
