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

// Phase 2 (P0-6) — the confirm endpoint service: install gating, input
// re-validation, and tenant-scoped execution of a confirmed plugin tool call.

import type * as dbModule from '@kestrel/db';
import { pluginHost } from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { confirmPluginToolExecution } from '@/lib/services/plugin-tool-confirm';

const mocks = vi.hoisted(() => ({
  getInstalledPlugin: vi.fn(),
  getInstalledPluginRuntime: vi.fn(),
  pluginExecutionContextFor: vi.fn(),
  runWithPluginTenantScope: vi.fn(),
  ensureBundledPluginsRegistered: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof dbModule>();
  return { ...actual, getInstalledPlugin: mocks.getInstalledPlugin };
});

vi.mock('@kestrel/ai/plugins', () => ({
  getInstalledPluginRuntime: mocks.getInstalledPluginRuntime,
  pluginExecutionContextFor: mocks.pluginExecutionContextFor,
  runWithPluginTenantScope: mocks.runWithPluginTenantScope,
}));

vi.mock('@kestrel/plugins', () => ({
  ensureBundledPluginsRegistered: mocks.ensureBundledPluginsRegistered,
}));

const context = {
  pluginId: 'paper-trading',
  userId: 'user-1',
  tenantId: 'tenant-1',
  settings: {},
  storage: {},
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
};

function registerPlugin(execute: (input: unknown) => Promise<unknown>): void {
  pluginHost.register({
    manifest: {
      id: 'paper-trading',
      name: 'Paper Trading',
      version: '1.0.0',
      tagline: 'test',
      description: 'test',
      category: 'trading-execution' as const,
      iconName: 'IconWallet',
      installMode: 'instant' as const,
    },
    tools: [
      {
        name: 'paper_place_order',
        description: 'Place a paper order',
        inputSchema: z.object({ symbol: z.string(), lots: z.number() }),
        outputSchema: z.object({ ok: z.boolean() }),
        access: 'write' as const,
        execute: execute as never,
      },
    ],
  });
}

describe('confirmPluginToolExecution (P0-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pluginHost.clear();
    mocks.execute.mockResolvedValue({ ok: true });
    registerPlugin(mocks.execute);
    mocks.getInstalledPlugin.mockResolvedValue({ enabled: true });
    mocks.getInstalledPluginRuntime.mockResolvedValue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      installedPluginIds: ['paper-trading'],
      plugins: [],
    });
    mocks.pluginExecutionContextFor.mockReturnValue(context);
    mocks.runWithPluginTenantScope.mockImplementation(
      async (_userId: string, _tenantId: string, work: () => Promise<unknown>) => work(),
    );
  });

  it('executes the confirmed tool inside the tenant scope and returns its output', async () => {
    const result = await confirmPluginToolExecution({
      userId: 'user-1',
      pluginId: 'paper-trading',
      toolId: 'paper_place_order',
      input: { symbol: 'XAUUSD', lots: 1 },
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.execute).toHaveBeenCalledWith(
      { symbol: 'XAUUSD', lots: 1 },
      expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-1' }),
    );
    expect(mocks.runWithPluginTenantScope).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      expect.any(Function),
    );
  });

  it('rejects an unknown tool id and a cross-plugin tool id', async () => {
    await expect(
      confirmPluginToolExecution({
        userId: 'user-1',
        pluginId: 'paper-trading',
        toolId: 'nope',
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });

    await expect(
      confirmPluginToolExecution({
        userId: 'user-1',
        pluginId: 'backtesting',
        toolId: 'paper_place_order',
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects when the plugin is not installed or disabled', async () => {
    mocks.getInstalledPlugin.mockResolvedValue(undefined);
    await expect(
      confirmPluginToolExecution({
        userId: 'user-1',
        pluginId: 'paper-trading',
        toolId: 'paper_place_order',
        input: { symbol: 'XAUUSD', lots: 1 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });

    mocks.getInstalledPlugin.mockResolvedValue({ enabled: false });
    await expect(
      confirmPluginToolExecution({
        userId: 'user-1',
        pluginId: 'paper-trading',
        toolId: 'paper_place_order',
        input: { symbol: 'XAUUSD', lots: 1 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('re-validates the proposed input against the tool schema', async () => {
    await expect(
      confirmPluginToolExecution({
        userId: 'user-1',
        pluginId: 'paper-trading',
        toolId: 'paper_place_order',
        input: { symbol: 'XAUUSD', lots: 'one' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects when the runtime no longer has the plugin enabled', async () => {
    mocks.getInstalledPluginRuntime.mockResolvedValue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      installedPluginIds: [],
      plugins: [],
    });

    await expect(
      confirmPluginToolExecution({
        userId: 'user-1',
        pluginId: 'paper-trading',
        toolId: 'paper_place_order',
        input: { symbol: 'XAUUSD', lots: 1 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('maps an execution failure to a 500 envelope', async () => {
    mocks.execute.mockRejectedValue(new Error('margin check failed'));

    await expect(
      confirmPluginToolExecution({
        userId: 'user-1',
        pluginId: 'paper-trading',
        toolId: 'paper_place_order',
        input: { symbol: 'XAUUSD', lots: 1 },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500, message: 'margin check failed' });
  });
});
