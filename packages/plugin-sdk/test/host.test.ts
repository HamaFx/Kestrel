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
import { z } from 'zod';

import { PluginHost } from '../src/host';
import { definePlugin } from '../src/index';
import type { KestrelPlugin, PluginExecutionContext } from '../src/types';

const InputSchema = z.object({ symbol: z.string() });
const OutputSchema = z.object({ ok: z.boolean() });

function makePlugin(id: string, overrides: Partial<KestrelPlugin> = {}): KestrelPlugin {
  return definePlugin({
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      tagline: `${id} plugin`,
      description: `${id} plugin`,
      category: 'quant-research',
      iconName: 'IconPuzzle',
      installMode: 'instant',
    },
    tools: [
      {
        name: `${id.replaceAll('-', '_')}_tool`,
        description: 'test tool',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        access: 'read-only',
        execute: async () => ({ ok: true }),
      },
    ],
    ...overrides,
  });
}

function ctx(pluginId: string): PluginExecutionContext {
  return {
    pluginId,
    userId: 'user-1',
    tenantId: 'tenant-1',
    settings: {},
    storage: {
      get: async () => null,
      set: async () => undefined,
      list: async () => [],
      delete: async () => undefined,
      clear: async () => undefined,
    },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  };
}

describe('PluginHost', () => {
  it('rejects duplicate plugin ids', () => {
    const host = new PluginHost();
    host.register(makePlugin('alpha'));
    expect(() => host.register(makePlugin('alpha'))).toThrow(/already registered/);
  });

  it('rejects duplicate tool ids across plugins', () => {
    const host = new PluginHost();
    host.register(makePlugin('alpha'));
    const beta = makePlugin('beta', {
      tools: [
        {
          name: 'alpha_tool',
          description: 'collides',
          inputSchema: InputSchema,
          outputSchema: OutputSchema,
          access: 'read-only',
          execute: async () => ({ ok: true }),
        },
      ],
    });
    expect(() => host.register(beta)).toThrow(/already registered/);
  });

  it('rejects tools that shadow a core tool', () => {
    const host = new PluginHost();
    const plugin = makePlugin('alpha', {
      tools: [
        {
          name: 'get_price',
          description: 'shadow',
          inputSchema: InputSchema,
          outputSchema: OutputSchema,
          access: 'read-only',
          execute: async () => ({ ok: true }),
        },
      ],
    });
    expect(() => host.register(plugin)).toThrow(/collides with a core tool/);
  });

  it('resolves only tools from installed plugins, for the right target', () => {
    const host = new PluginHost();
    host.register(
      makePlugin('backtesting', {
        tools: [
          {
            name: 'run_backtest',
            description: 'run',
            inputSchema: InputSchema,
            outputSchema: OutputSchema,
            access: 'read-only',
            attachTo: ['canonical-chat'],
            execute: async () => ({ ok: true }),
          },
        ],
      }),
    );
    host.register(
      makePlugin('paper-trading', {
        tools: [
          {
            name: 'paper_place_order',
            description: 'order',
            inputSchema: InputSchema,
            outputSchema: OutputSchema,
            access: 'write',
            requiresConfirmation: (input: unknown) => Boolean(input),
            attachTo: ['technical', 'canonical-chat'],
            execute: async () => ({ ok: true }),
          },
        ],
      }),
    );

    expect(host.resolveToolsForUser(['backtesting']).map((t) => t.name)).toEqual(['run_backtest']);
    expect(
      host
        .resolveToolsForUser(['backtesting', 'paper-trading'], { target: 'technical' })
        .map((t) => t.name),
    ).toEqual(['paper_place_order']);
    expect(
      host
        .resolveToolsForUser(['backtesting', 'paper-trading'], {
          disabledTools: ['run_backtest'],
        })
        .map((t) => t.name),
    ).toEqual(['paper_place_order']);
    expect(host.resolveToolsForUser([], {}).length).toBe(0);
  });

  it('tracks write tools and conservative confirmation state', () => {
    const host = new PluginHost();
    host.register(
      makePlugin('paper-trading', {
        tools: [
          {
            name: 'paper_place_order',
            description: 'order',
            inputSchema: InputSchema,
            outputSchema: OutputSchema,
            access: 'write',
            requiresConfirmation: () => true,
            execute: async () => ({ ok: true }),
          },
          {
            name: 'paper_sandbox_order',
            description: 'autonomous order',
            inputSchema: InputSchema,
            outputSchema: OutputSchema,
            access: 'write',
            execute: async () => ({ ok: true }),
          },
        ],
      }),
    );

    expect(host.isWriteTool('paper_place_order')).toBe(true);
    expect(host.isWriteTool('get_price')).toBe(false);
    expect(host.requiresConfirmationForTool('paper_place_order')).toBe(true);
    // A write tool that forgets the flag must fail safe.
    expect(host.requiresConfirmationForTool('paper_sandbox_order')).toBe(true);
    expect(host.requiresConfirmationForTool('missing')).toBe(false);
  });

  it('resolves skills and agents per user', () => {
    const host = new PluginHost();
    host.register(
      makePlugin('alpha', {
        skills: [
          'skills/alpha',
          { name: 'alpha-skill', description: 'd', instructions: 'Do the thing.' },
        ],
        agents: [
          {
            id: 'alpha-agent',
            name: 'Alpha Agent',
            description: 'standalone',
            instructions: 'Be helpful.',
          },
        ],
      }),
    );

    expect(host.resolveSkillsForUser(['alpha'])).toHaveLength(2);
    expect(host.resolveSkillsForUser(['beta'])).toHaveLength(0);
    expect(host.resolveAgentsForUser(['alpha']).map((a) => a.id)).toEqual(['alpha-agent']);
    expect(host.resolveAgentsForUser([])).toHaveLength(0);
  });

  it('normalises jobs, tick subscribers, alert channels and indicators with plugin ids', () => {
    const host = new PluginHost();
    host.register(
      makePlugin('paper-trading', {
        jobs: [
          {
            id: 'daily-report',
            description: 'report',
            schedule: '0 8 * * *',
            lock: 'daily',
            run: async () => ({ processed: 0 }),
          },
        ],
        tickSubscribers: [
          {
            id: 'fills',
            symbols: ['XAUUSD'],
            handler: () => undefined,
          },
        ],
        alertChannels: [
          {
            id: 'paper-push',
            label: 'Paper push',
            deliver: async () => ({ ok: true }),
          },
        ],
        indicators: [
          {
            kind: 'supertrend',
            description: 'Supertrend',
            paramsSchema: z.object({ period: z.number().default(10) }),
            compute: () => [],
          },
        ],
      }),
    );

    expect(host.getJobs()[0]?.pluginId).toBe('paper-trading');
    expect(host.getTickSubscribers()[0]?.pluginId).toBe('paper-trading');
    expect(host.getAlertChannels()[0]?.pluginId).toBe('paper-trading');
    expect(host.getIndicators()[0]?.pluginId).toBe('paper-trading');
    expect(host.resolveJobsForUser(['paper-trading'])).toHaveLength(1);
    expect(host.resolveJobsForUser(['other'])).toHaveLength(0);
  });

  it('rejects reserved alert channel and indicator ids', () => {
    const host = new PluginHost();
    expect(() =>
      host.register(
        makePlugin('alpha', {
          alertChannels: [
            { id: 'telegram', label: 'Telegram', deliver: async () => ({ ok: true }) },
          ],
        }),
      ),
    ).toThrow(/reserved/);

    const second = new PluginHost();
    expect(() =>
      second.register(
        makePlugin('alpha', {
          indicators: [
            {
              kind: 'rsi',
              description: 'shadow',
              paramsSchema: z.object({}),
              compute: () => [],
            },
          ],
        }),
      ),
    ).toThrow(/reserved/);
  });

  it('exposes api routes and clears all state', () => {
    const host = new PluginHost();
    host.register(
      makePlugin('alpha', {
        apiRoutes: {
          '/status': async () => new Response('ok'),
        },
        publicApiRoutes: {
          '/webhook/:token': async () => new Response('ok'),
        },
      }),
    );
    expect(host.getApiRoutes('alpha')).toHaveProperty('/status');
    expect(host.getPublicApiRoutes('alpha')).toHaveProperty('/webhook/:token');
    expect(host.size).toBe(1);
    host.clear();
    expect(host.size).toBe(0);
    expect(host.getTool('alpha_tool')).toBeUndefined();
    expect(host.getPublicApiRoutes('alpha')).toBeUndefined();
  });

  it('passes a per-plugin execution context through to tools', async () => {
    const host = new PluginHost();
    let seen: PluginExecutionContext | undefined;
    host.register(
      makePlugin('alpha', {
        tools: [
          {
            name: 'alpha_tool',
            description: 'test',
            inputSchema: InputSchema,
            outputSchema: OutputSchema,
            access: 'read-only',
            execute: async (_input, context) => {
              seen = context;
              return { ok: true };
            },
          },
        ],
      }),
    );
    const tool = host.resolveToolsForUser(['alpha'])[0]!;
    await tool.execute({ symbol: 'XAUUSD' }, ctx('alpha'));
    expect(seen?.pluginId).toBe('alpha');
    expect(seen?.userId).toBe('user-1');
  });
});
