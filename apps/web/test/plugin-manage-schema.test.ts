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

import { describe, expect, it } from 'vitest';

import { PluginManageRequestSchema } from '@/lib/plugins/manage-schema';

describe('PluginManageRequestSchema', () => {
  it('accepts the four supported actions', () => {
    expect(
      PluginManageRequestSchema.parse({ action: 'install', pluginId: 'backtesting' }),
    ).toMatchObject({ action: 'install', pluginId: 'backtesting' });

    expect(
      PluginManageRequestSchema.parse({
        action: 'update-settings',
        pluginId: 'telegram-bot',
        settings: { botToken: 'secret' },
        completeOnboarding: true,
      }),
    ).toMatchObject({ action: 'update-settings', completeOnboarding: true });

    expect(
      PluginManageRequestSchema.parse({
        action: 'uninstall',
        pluginId: 'paper-trading',
        wipeData: true,
      }),
    ).toMatchObject({ wipeData: true });

    expect(
      PluginManageRequestSchema.parse({
        action: 'set-enabled',
        pluginId: 'custom-agents',
        enabled: false,
      }),
    ).toMatchObject({ enabled: false });
  });

  it('rejects non-kebab plugin ids and unknown actions', () => {
    expect(() =>
      PluginManageRequestSchema.parse({ action: 'install', pluginId: 'Telegram Bot' }),
    ).toThrow();
    expect(() =>
      PluginManageRequestSchema.parse({ action: 'destroy', pluginId: 'telegram-bot' }),
    ).toThrow();
  });

  it('rejects a missing settings object for update-settings', () => {
    expect(() =>
      PluginManageRequestSchema.parse({ action: 'update-settings', pluginId: 'telegram-bot' }),
    ).toThrow();
  });
});
