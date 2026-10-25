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

// The `PluginUiDefinition` a plugin package exports, plus the shapes the
// registry returns for a user's installed plugins.

import type { ComponentType } from 'react';

import type { PluginId } from '../types';
import type {
  PluginDashboardWidget,
  PluginNavItem,
  PluginPageRegistration,
  PluginSetupWizardProps,
  PluginSlashCommand,
  PluginToolPartRegistration,
} from './slots';

export interface PluginUiDefinition {
  /** Custom chat tool cards, keyed by plugin tool name. */
  chatToolParts?: Readonly<Record<string, PluginToolPartRegistration>>;
  dashboardWidgets?: readonly PluginDashboardWidget[];
  navItems?: readonly PluginNavItem[];
  pages?: readonly PluginPageRegistration[];
  slashCommands?: readonly PluginSlashCommand[];
  setupWizardComponent?: ComponentType<PluginSetupWizardProps>;
}

/** Identity helper for type inference and authoring ergonomics. */
export function definePluginUi<const T extends PluginUiDefinition>(ui: T): T {
  return ui;
}

export interface RegisteredNavItem {
  pluginId: PluginId;
  item: PluginNavItem;
}

export interface RegisteredDashboardWidget {
  pluginId: PluginId;
  widget: PluginDashboardWidget;
}

export interface RegisteredSlashCommand {
  pluginId: PluginId;
  command: PluginSlashCommand;
}
