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

// Schema guarantees for Custom Agents.

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { customAgentRuns, customAgents } from '../src/db/tables';

describe('custom agents schema', () => {
  it('prefixes both tables and forces tenant RLS', () => {
    for (const table of [customAgents, customAgentRuns]) {
      const config = getTableConfig(table);
      expect(config.name.startsWith('plg_custom_agents')).toBe(true);
      expect(config.enableRLS).toBe(true);
      expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
      expect(config.columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['id', 'tenant_id', 'user_id', 'created_at']),
      );
    }
    expect(getTableConfig(customAgents).columns.map((column) => column.name)).toContain(
      'updated_at',
    );
  });

  it('stores run history against an agent', () => {
    const config = getTableConfig(customAgentRuns);
    expect(config.name).toBe('plg_custom_agents_runs');
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'agent_id',
        'run_id',
        'thread_id',
        'status',
        'model',
        'latency_ms',
        'cost_usd',
        'tool_calls',
        'error',
      ]),
    );
  });

  it('stores identity, instructions, tools, skills and MCP config', () => {
    const config = getTableConfig(customAgents);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'slug',
        'name',
        'description',
        'instructions',
        'model',
        'tools',
        'skills',
        'skill_refs',
        'mcp_servers',
        'delegatable',
        'starter_template',
        'run_count',
        'last_used_at',
      ]),
    );
  });

  it('enforces one handle per user', () => {
    const config = getTableConfig(customAgents);
    const unique = config.indexes.filter((index) => index.config.unique);
    expect(
      unique.some(
        (index) =>
          index.config.columns.some((column) => 'name' in column && column.name === 'user_id') &&
          index.config.columns.some((column) => 'name' in column && column.name === 'slug'),
      ),
    ).toBe(true);
  });
});
