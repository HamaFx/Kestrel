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

import { describePluginSettingsSchema, PluginHost } from '@kestrel/plugin-sdk';
import { describe, expect, it } from 'vitest';

import plugin from '../src/index';
import { isValidTimezone, normaliseSettings } from '../src/settings';

describe('telegram-bot plugin', () => {
  it('registers with the host and is visible only to installed users', () => {
    const host = new PluginHost();
    host.register(plugin);

    expect(host.getPlugin('telegram-bot')).toBeDefined();
    expect(host.resolveToolsForUser(['telegram-bot'])).toHaveLength(4);
    expect(host.resolveToolsForUser([])).toHaveLength(0);
    expect(host.getJobs().map((job) => job.id)).toContain('daily-briefing');
    expect(host.getAlertChannels().map((channel) => channel.id)).toContain('telegram-bot');
    expect(host.getPublicApiRoutes('telegram-bot')).toHaveProperty('/webhook/:token');
  });

  it('declares a wizard whose credential fields exist in the settings schema', () => {
    const fields = new Set(
      describePluginSettingsSchema(plugin.manifest.settingsSchema).fields.map((field) => field.key),
    );

    expect(plugin.manifest.installMode).toBe('wizard');
    expect(plugin.manifest.setupSteps?.length).toBeGreaterThanOrEqual(4);
    for (const step of plugin.manifest.setupSteps ?? []) {
      const stepFields = 'fields' in step ? (step.fields ?? []) : [];
      for (const field of stepFields) {
        expect(fields.has(field), `step ${step.id} references missing field ${field}`).toBe(true);
      }
    }
  });

  it('applies safe defaults without requiring a token during install', () => {
    expect(normaliseSettings({})).toMatchObject({
      alertsEnabled: true,
      briefingEnabled: false,
      briefingTime: '07:30',
      timezone: 'UTC',
      briefingIncludePositions: true,
    });
  });

  it('validates IANA timezones', () => {
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
  });
});
