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

// Streaming-plugin tenant scope (P1-1).
//
// `tool.execute` runs from ReadableStream continuations after `withAuth`'s
// `withTenantDbFresh` transaction has committed, so the adapter itself must
// re-establish a tenant scope for every plugin tool call. A matching ambient
// scope must be reused instead of nesting another transaction.

import type * as dbModule from '@kestrel/db';
import type { RegisteredPluginTool } from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildPluginMastraTools } from '../src/plugins/mastra-tools';
import { runWithPluginTenantScope, type InstalledPluginRuntime } from '../src/plugins/runtime';

const mocks = vi.hoisted(() => ({
  withTenantDb: vi.fn(),
  getTenantDbScope: vi.fn(),
  requireTenantIdForUser: vi.fn(),
}));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof dbModule>();
  return {
    ...actual,
    withTenantDb: mocks.withTenantDb,
    getTenantDbScope: mocks.getTenantDbScope,
    requireTenantIdForUser: mocks.requireTenantIdForUser,
  };
});

vi.mock('@ai/mastra-v2/shared/tool-telemetry', () => ({
  executeMastraTool: async (_toolName: string, _context: unknown, fn: () => Promise<unknown>) =>
    fn(),
}));

const runtime: InstalledPluginRuntime = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  installedPluginIds: ['paper-trading'],
  plugins: [{ pluginId: 'paper-trading', enabled: true, settings: {} }],
};

function fakePluginTool(execute: (input: unknown) => Promise<unknown>): RegisteredPluginTool {
  return {
    name: 'paper_list_orders',
    description: 'List paper orders',
    inputSchema: z.object({ account: z.string().optional() }),
    outputSchema: z.object({}).passthrough(),
    access: 'read-only',
    attachTo: ['canonical-chat'],
    pluginId: 'paper-trading',
    execute: execute as RegisteredPluginTool['execute'],
  } as RegisteredPluginTool;
}

interface BuiltTool {
  execute: (input: unknown, ctx: unknown) => Promise<unknown>;
}

describe('runWithPluginTenantScope', () => {
  beforeEach(() => {
    mocks.withTenantDb.mockReset();
    mocks.getTenantDbScope.mockReset();
    mocks.requireTenantIdForUser.mockReset();
  });

  it('opens a tenant transaction when no scope is active', async () => {
    mocks.getTenantDbScope.mockReturnValue(null);
    mocks.withTenantDb.mockImplementation(async (_tenantId: string, work: () => Promise<unknown>) =>
      work(),
    );

    const result = await runWithPluginTenantScope('user-1', 'tenant-1', async () => 'done');

    expect(result).toBe('done');
    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-1', expect.any(Function), {
      userId: 'user-1',
    });
  });

  it('resolves the tenant when the caller cannot supply one', async () => {
    mocks.getTenantDbScope.mockReturnValue(null);
    mocks.requireTenantIdForUser.mockResolvedValue('tenant-9');
    mocks.withTenantDb.mockImplementation(async (_tenantId: string, work: () => Promise<unknown>) =>
      work(),
    );

    await runWithPluginTenantScope('user-9', null, async () => 'done');

    expect(mocks.requireTenantIdForUser).toHaveBeenCalledWith('user-9');
    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-9', expect.any(Function), {
      userId: 'user-9',
    });
  });

  it('reuses a matching active scope without nesting a transaction', async () => {
    mocks.getTenantDbScope.mockReturnValue({
      tenantId: 'tenant-1',
      db: {},
      userId: 'user-1',
    });

    const result = await runWithPluginTenantScope('user-1', 'tenant-1', async () => 'reused');

    expect(result).toBe('reused');
    expect(mocks.withTenantDb).not.toHaveBeenCalled();
  });

  it('never reuses a scope that belongs to another tenant', async () => {
    mocks.getTenantDbScope.mockReturnValue({
      tenantId: 'tenant-other',
      db: {},
      userId: 'user-other',
    });
    mocks.withTenantDb.mockImplementation(async (_tenantId: string, work: () => Promise<unknown>) =>
      work(),
    );

    await runWithPluginTenantScope('user-1', 'tenant-1', async () => 'done');

    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-1', expect.any(Function), {
      userId: 'user-1',
    });
  });
});

describe('buildPluginMastraTools tenant scope', () => {
  beforeEach(() => {
    mocks.withTenantDb.mockReset();
    mocks.getTenantDbScope.mockReset();
    mocks.requireTenantIdForUser.mockReset();
  });

  it('wraps plugin tool execution in the tenant scope on streaming continuations', async () => {
    mocks.getTenantDbScope.mockReturnValue(null);
    mocks.withTenantDb.mockImplementation(async (_tenantId: string, work: () => Promise<unknown>) =>
      work(),
    );
    const execute = vi.fn(async () => ({ orders: [] }));

    const tools = buildPluginMastraTools({ runtime, tools: [fakePluginTool(execute)] });
    const built = tools['paper_list_orders'] as BuiltTool;
    const result = await built.execute({ account: 'personal' }, {});

    expect(result).toEqual({ orders: [] });
    expect(mocks.withTenantDb).toHaveBeenCalledWith('tenant-1', expect.any(Function), {
      userId: 'user-1',
    });
    expect(execute).toHaveBeenCalledWith(
      { account: 'personal' },
      expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-1' }),
    );
  });

  it('does not nest a transaction when the tool already runs inside a scope', async () => {
    mocks.getTenantDbScope.mockReturnValue({
      tenantId: 'tenant-1',
      db: {},
      userId: 'user-1',
    });
    const execute = vi.fn(async () => ({ ok: true }));

    const tools = buildPluginMastraTools({ runtime, tools: [fakePluginTool(execute)] });
    const built = tools['paper_list_orders'] as BuiltTool;
    await built.execute({}, {});

    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantDb).not.toHaveBeenCalled();
  });
});
