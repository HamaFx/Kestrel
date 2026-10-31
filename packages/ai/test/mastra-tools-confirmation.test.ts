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

// Phase 2 (P0-6) — `requiresConfirmation` tools must never hang the stream.
//
// Mastra's `requireApproval` suspends with a `tool-call-approval` chunk that
// Kestrel never resumes. The adapter evaluates the policy itself and returns a
// stateless confirmation envelope: the tool does not execute, the model sees a
// clean view (no `_ui`), and the chat card re-executes on Confirm.

import type * as dbModule from '@kestrel/db';
import type { RegisteredPluginTool } from '@kestrel/plugin-sdk';
import { PLUGIN_TOOL_CONFIRM_KIND } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildPluginMastraTools } from '../src/plugins/mastra-tools';
import type { InstalledPluginRuntime } from '../src/plugins/runtime';

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

interface BuiltTool {
  execute: (input: unknown, context: unknown) => Promise<unknown>;
  toModelOutput?: (output: unknown) => unknown;
}

function fakePlaceOrderTool(
  execute: (input: unknown) => Promise<unknown>,
  requiresConfirmation: RegisteredPluginTool['requiresConfirmation'],
): RegisteredPluginTool {
  return {
    name: 'paper_place_order',
    description: 'Place a paper order',
    inputSchema: z.object({ accountKind: z.enum(['personal', 'agent_sandbox']).optional() }),
    outputSchema: z.object({ filled: z.boolean() }),
    access: 'write',
    attachTo: ['canonical-chat'],
    pluginId: 'paper-trading',
    ...(requiresConfirmation !== undefined ? { requiresConfirmation } : {}),
    execute: execute as RegisteredPluginTool['execute'],
  } as RegisteredPluginTool;
}

function buildOne(tool: RegisteredPluginTool): BuiltTool {
  const tools = buildPluginMastraTools({ runtime, tools: [tool] });
  return tools['paper_place_order'] as unknown as BuiltTool;
}

describe('plugin tool confirmation envelope (P0-6)', () => {
  beforeEach(() => {
    mocks.withTenantDb.mockReset();
    mocks.getTenantDbScope.mockReset();
    mocks.requireTenantIdForUser.mockReset();
    mocks.getTenantDbScope.mockReturnValue({
      tenantId: 'tenant-1',
      db: {},
      userId: 'user-1',
    });
  });

  it('executes a sandbox order immediately and never wraps it in a confirmation', async () => {
    const execute = vi.fn(async () => ({ filled: true }));
    const confirmationPolicy = vi.fn(async (input: { accountKind?: string }) => {
      return input.accountKind === 'personal';
    });
    const built = buildOne(fakePlaceOrderTool(execute, confirmationPolicy));

    const result = await built.execute({ accountKind: 'agent_sandbox' }, {});

    expect(result).toEqual({ filled: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(confirmationPolicy).toHaveBeenCalledWith(
      { accountKind: 'agent_sandbox' },
      expect.objectContaining({ userId: 'user-1', tenantId: 'tenant-1' }),
    );
  });

  it('returns a confirmation envelope without executing a personal order', async () => {
    const execute = vi.fn(async () => ({ filled: true }));
    const built = buildOne(
      fakePlaceOrderTool(execute, async (input: { accountKind?: string }) => {
        return input.accountKind === 'personal';
      }),
    );

    const result = (await built.execute({ accountKind: 'personal' }, {})) as Record<
      string,
      unknown
    >;

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'confirmation_required',
      requiresConfirmation: true,
      pluginId: 'paper-trading',
      toolId: 'paper_place_order',
      description: 'Place a paper order',
      proposedInput: { accountKind: 'personal' },
      _ui: {
        kind: PLUGIN_TOOL_CONFIRM_KIND,
        pluginId: 'paper-trading',
        toolId: 'paper_place_order',
        proposedInput: { accountKind: 'personal' },
      },
    });
  });

  it('requires confirmation for a static `true` policy', async () => {
    const execute = vi.fn(async () => ({ filled: true }));
    const built = buildOne(fakePlaceOrderTool(execute, true));

    const result = (await built.execute({}, {})) as Record<string, unknown>;

    expect(execute).not.toHaveBeenCalled();
    expect(result['status']).toBe('confirmation_required');
  });

  it('executes tools without a confirmation policy', async () => {
    const execute = vi.fn(async () => ({ filled: true }));
    const built = buildOne(fakePlaceOrderTool(execute, undefined));

    const result = await built.execute({}, {});

    expect(result).toEqual({ filled: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('hides the _ui payload from the model and delegates real outputs to the tool mapper', async () => {
    const execute = vi.fn(async () => ({ filled: true }));
    const built = buildOne(fakePlaceOrderTool(execute, true));

    const envelope = await built.execute({ accountKind: 'personal' }, {});
    const modelView = built.toModelOutput?.(envelope) as Record<string, unknown>;

    expect(modelView).toMatchObject({
      status: 'confirmation_required',
      toolId: 'paper_place_order',
      proposedInput: { accountKind: 'personal' },
    });
    expect(modelView).not.toHaveProperty('_ui');

    // Without a tool-level mapper the model sees the raw output unchanged.
    expect(built.toModelOutput?.({ filled: true })).toBeUndefined();
  });

  it('delegates real outputs to the tool toModelOutput when one is registered', async () => {
    const execute = vi.fn(async () => ({ filled: true }));
    const tool = fakePlaceOrderTool(execute, true);
    const built = buildOne({
      ...tool,
      toModelOutput: (output: unknown) => ({ compact: output }),
    } as RegisteredPluginTool);

    await built.execute({}, {});

    expect(built.toModelOutput?.({ filled: true })).toEqual({ compact: { filled: true } });
  });
});
