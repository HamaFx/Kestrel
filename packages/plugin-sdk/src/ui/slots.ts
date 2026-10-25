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

// Slot contracts for plugin UI, grouped by component kind: chat tool cards,
// dashboard widgets, nav items, pages, slash commands and the setup wizard.

import type { ComponentType } from 'react';
import type { z } from 'zod';

import type { PluginId } from '../types';

// ── Chat tool cards ───────────────────────────────────────────────────────

export interface PluginToolPartProps {
  output: unknown;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export interface PluginToolPartRegistration {
  component: ComponentType<PluginToolPartProps>;
  /** Optional output validation before the custom card renders. */
  schema?: z.ZodType;
}

// ── Dashboard widgets ─────────────────────────────────────────────────────

export interface PluginDashboardWidgetProps {
  pluginId: PluginId;
  settings: Readonly<Record<string, unknown>>;
}

export interface PluginDashboardWidget {
  id: string;
  title: string;
  description?: string;
  component: ComponentType<PluginDashboardWidgetProps>;
  defaultSize?: 'sm' | 'md' | 'lg' | 'full';
}

// ── Navigation ────────────────────────────────────────────────────────────

export interface PluginNavItem {
  href: string;
  label: string;
  /** Tabler icon name resolved by the host shell. */
  iconName?: string;
  description?: string;
  match?: readonly string[];
  /** Lower numbers appear first. */
  order?: number;
}

// ── Pages ─────────────────────────────────────────────────────────────────

export interface PluginPageProps {
  pluginId: PluginId;
  params: Readonly<Record<string, string>>;
}

export interface PluginPageRegistration {
  /** Path relative to `/plugins/<pluginId>`, e.g. `runs/:runId`. */
  path: string;
  component: ComponentType<PluginPageProps>;
}

// ── Slash commands ────────────────────────────────────────────────────────

export interface PluginSlashCommand {
  /** Command id without the slash, e.g. `backtest`. */
  id: string;
  label: string;
  description?: string;
}

// ── Setup wizard ──────────────────────────────────────────────────────────

export interface PluginSetupWizardProps {
  pluginId: PluginId;
  onComplete?: () => void;
  onCancel?: () => void;
}
