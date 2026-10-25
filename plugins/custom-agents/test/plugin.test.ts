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

import { PluginHost } from '@kestrel/plugin-sdk';
import { describe, expect, it } from 'vitest';

import plugin from '../src/index';
import { DEFAULT_SETTINGS, normaliseSettings } from '../src/settings';
import { AGENT_TEMPLATES } from '../src/templates';

describe('custom agents plugin', () => {
  it('registers its tools, skill, catalog and API routes', () => {
    const host = new PluginHost();
    host.register(plugin);

    expect(host.getPlugin('custom-agents')).toBeDefined();
    expect(
      host
        .resolveToolsForUser(['custom-agents'])
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(
      [
        'custom_agent_create',
        'custom_agent_delete',
        'custom_agent_get',
        'custom_agent_list',
        'custom_agent_templates',
        'custom_agent_update',
      ].sort(),
    );
    expect(host.resolveToolsForUser([])).toHaveLength(0);
    expect(host.resolveSkillsForUser(['custom-agents'])).toHaveLength(1);
    expect(host.resolveAgentCatalogsForUser(['custom-agents'])).toHaveLength(1);
    expect(host.resolveAgentCatalogsForUser([])).toHaveLength(0);
    expect(plugin.apiRoutes?.['/agents']).toBeDefined();
    expect(plugin.apiRoutes?.['/catalog']).toBeDefined();
  });

  it('gates agent mutations behind approval', () => {
    const host = new PluginHost();
    host.register(plugin);
    for (const name of ['custom_agent_create', 'custom_agent_update', 'custom_agent_delete']) {
      expect(host.getTool(name)?.access).toBe('write');
      expect(host.requiresConfirmationForTool(name)).toBe(true);
    }
    expect(host.requiresConfirmationForTool('custom_agent_list')).toBe(false);
    expect(host.requiresConfirmationForTool('custom_agent_templates')).toBe(false);
  });

  it('ships four distinct starter handles', () => {
    expect(AGENT_TEMPLATES).toHaveLength(4);
    const slugs = AGENT_TEMPLATES.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain('ict-mentor');
    expect(slugs).toContain('pine-coder');
    expect(slugs).toContain('macro-fed-watcher');
    expect(slugs).toContain('prop-risk-coach');
    for (const template of AGENT_TEMPLATES) {
      expect(template.instructions.length).toBeGreaterThan(20);
      expect(template.tools.length).toBeGreaterThan(0);
    }
  });

  it('normalises settings and clamps unsafe values', () => {
    expect(normaliseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings({ allowWriteTools: true, maxAgents: 5 })).toMatchObject({
      allowWriteTools: true,
      maxAgents: 5,
    });
    expect(normaliseSettings({ maxAgents: 0 }).maxAgents).toBe(20);
    expect(normaliseSettings({ maxMcpServers: 99 }).maxMcpServers).toBe(2);
  });
});
