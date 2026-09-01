import type { Tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { withTelemetry } from '../src/tools/with-telemetry';

vi.mock('../src/persistence', () => ({ recordToolTelemetry: vi.fn() }));

describe('tool timeout wrapper', () => {
  it('propagates parent abort to the tool', async () => {
    const controller = new AbortController();
    const seen = vi.fn();
    const tool = {
      description: 'test',
      execute: async (_input: unknown, options: { abortSignal: AbortSignal }) => {
        options.abortSignal.addEventListener('abort', () => seen());
        await new Promise(() => undefined);
      },
    } as unknown as Tool;
    const wrapped = withTelemetry('test_abort_tool', tool) as typeof tool & {
      execute: (input: unknown, options: Record<string, unknown>) => Promise<unknown>;
    };
    const pending = wrapped.execute(
      {},
      { abortSignal: controller.signal, toolCallId: 'test', messages: [] },
    );
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toBeTruthy();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('rejects a tool that exceeds its deadline', async () => {
    const tool = {
      description: 'test',
      execute: async () => new Promise(() => undefined),
    } as unknown as Tool;
    const wrapped = withTelemetry('test_timeout_tool', tool) as typeof tool & {
      execute: (input: unknown, options: Record<string, unknown>) => Promise<unknown>;
    };
    await expect(wrapped.execute({}, { toolCallId: 'test', messages: [] })).rejects.toMatchObject({
      name: 'ToolTimeoutError',
    });
  }, 30_000);
});
