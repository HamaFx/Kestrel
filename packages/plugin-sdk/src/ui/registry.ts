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

// Process-wide UI slot registry.

import type { ComponentType } from 'react';

import type { PluginId } from '../types';
import type {
  PluginUiDefinition,
  RegisteredDashboardWidget,
  RegisteredNavItem,
  RegisteredSlashCommand,
} from './definition';
import type {
  PluginPageRegistration,
  PluginSetupWizardProps,
  PluginToolPartRegistration,
} from './slots';

/**
 * Process-wide UI slot registry.
 *
 * The registry is intentionally separate from `PluginHost`: the worker must
 * never load React components, and the web app can lazy-load plugin UI
 * chunks independently of the server capability graph.
 */
export class PluginUiRegistry {
  private readonly entries = new Map<PluginId, PluginUiDefinition>();
  private readonly toolParts = new Map<
    string,
    { pluginId: PluginId; registration: PluginToolPartRegistration }
  >();

  register(pluginId: PluginId, ui: PluginUiDefinition): void {
    if (this.entries.has(pluginId)) {
      throw new Error(`[plugin-sdk/ui] UI slots for plugin "${pluginId}" are already registered`);
    }
    for (const [toolName, registration] of Object.entries(ui.chatToolParts ?? {})) {
      const existing = this.toolParts.get(toolName);
      if (existing) {
        throw new Error(
          `[plugin-sdk/ui] chat tool part "${toolName}" is already registered by plugin "${existing.pluginId}"`,
        );
      }
      this.toolParts.set(toolName, { pluginId, registration });
    }
    this.entries.set(pluginId, ui);
  }

  get(pluginId: string): PluginUiDefinition | undefined {
    return this.entries.get(pluginId);
  }

  hasToolPart(toolName: string): boolean {
    return this.toolParts.has(toolName);
  }

  getToolPart(toolName: string): PluginToolPartRegistration | undefined {
    return this.toolParts.get(toolName)?.registration;
  }

  listNavItems(installedPluginIds: readonly string[]): RegisteredNavItem[] {
    const installed = new Set(installedPluginIds);
    const items: RegisteredNavItem[] = [];
    for (const [pluginId, ui] of this.entries) {
      if (!installed.has(pluginId)) continue;
      for (const item of ui.navItems ?? []) items.push({ pluginId, item });
    }
    return items.sort(
      (a, b) =>
        (a.item.order ?? 100) - (b.item.order ?? 100) || a.item.label.localeCompare(b.item.label),
    );
  }

  listDashboardWidgets(installedPluginIds: readonly string[]): RegisteredDashboardWidget[] {
    const installed = new Set(installedPluginIds);
    const widgets: RegisteredDashboardWidget[] = [];
    for (const [pluginId, ui] of this.entries) {
      if (!installed.has(pluginId)) continue;
      for (const widget of ui.dashboardWidgets ?? []) widgets.push({ pluginId, widget });
    }
    return widgets;
  }

  listSlashCommands(installedPluginIds: readonly string[]): RegisteredSlashCommand[] {
    const installed = new Set(installedPluginIds);
    const commands: RegisteredSlashCommand[] = [];
    for (const [pluginId, ui] of this.entries) {
      if (!installed.has(pluginId)) continue;
      for (const command of ui.slashCommands ?? []) commands.push({ pluginId, command });
    }
    return commands;
  }

  getPage(pluginId: string, path: string): PluginPageRegistration | undefined {
    return this.entries.get(pluginId)?.pages?.find((page) => page.path === path);
  }

  /**
   * Resolve a plugin page by path, supporting `:param` segments.
   *
   * Exact/static paths win over dynamic ones. The returned `params` are
   * passed to the plugin page component's `params` prop.
   */
  resolvePage(
    pluginId: string,
    path: string,
  ): { page: PluginPageRegistration; params: Record<string, string> } | null {
    const pages = this.entries.get(pluginId)?.pages;
    if (!pages || pages.length === 0) return null;

    const segments = path.split('/').filter(Boolean);
    const dynamicMatches: Array<{
      page: PluginPageRegistration;
      params: Record<string, string>;
    }> = [];

    for (const page of pages) {
      const parts = page.path.split('/').filter(Boolean);
      if (parts.length !== segments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      let dynamic = false;
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index]!;
        const segment = segments[index]!;
        if (part.startsWith(':')) {
          dynamic = true;
          params[part.slice(1)] = segment;
          continue;
        }
        if (part !== segment) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      if (!dynamic) return { page, params };
      dynamicMatches.push({ page, params });
    }

    return dynamicMatches[0] ?? null;
  }

  getSetupWizard(pluginId: string): ComponentType<PluginSetupWizardProps> | undefined {
    return this.entries.get(pluginId)?.setupWizardComponent;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.toolParts.clear();
  }
}

/** Process-wide UI registry, populated once by the web app bootstrap. */
const globalForPluginUi = globalThis as unknown as {
  __kestrelPluginUiRegistry?: PluginUiRegistry;
};

export const pluginUiRegistry = (globalForPluginUi.__kestrelPluginUiRegistry ??=
  new PluginUiRegistry());
