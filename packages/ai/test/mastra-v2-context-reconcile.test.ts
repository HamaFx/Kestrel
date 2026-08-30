import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backfillThreadHistoryIfNeeded } from '../src/mastra-v2/context';

const {
  claimMemoryBackfill,
  completeMemoryBackfill,
  failMemoryBackfill,
  getMemoryBackfillState,
  markMemoryProjectionFailed,
  markMemoryProjectionProjected,
} = vi.hoisted(() => ({
  claimMemoryBackfill: vi.fn(),
  completeMemoryBackfill: vi.fn(),
  failMemoryBackfill: vi.fn(),
  getMemoryBackfillState: vi.fn(),
  markMemoryProjectionFailed: vi.fn(),
  markMemoryProjectionProjected: vi.fn(),
}));
const listMessages = vi.hoisted(() => vi.fn());

vi.mock('@kestrel/db', () => ({
  claimMemoryBackfill,
  completeMemoryBackfill,
  failMemoryBackfill,
  getMemoryBackfillState,
  markMemoryProjectionFailed,
  markMemoryProjectionProjected,
}));
vi.mock('../src/persistence', () => ({ listMessages }));

beforeEach(() => {
  vi.clearAllMocks();
  getMemoryBackfillState.mockResolvedValue({ status: 'failed' });
  claimMemoryBackfill.mockResolvedValue({ userId: 'u1', threadId: 't1', claimed: true });
  completeMemoryBackfill.mockResolvedValue(undefined);
  listMessages.mockResolvedValue([
    { id: 'legacy-1', idempotencyKey: null, role: 'user', content: 'one', createdAt: 1 },
    { id: 'legacy-2', idempotencyKey: null, role: 'assistant', content: 'two', createdAt: 2 },
  ]);
});

describe('durable memory backfill reconciliation', () => {
  it('repairs only the legacy messages absent from native Mastra memory', async () => {
    const saveMessages = vi.fn().mockResolvedValue(undefined);
    const memory = {
      getThreadById: vi.fn().mockResolvedValue({ id: 't1' }),
      recall: vi.fn().mockResolvedValue({
        messages: [{ id: 'legacy-1' }],
      }),
      saveMessages,
    };

    const copied = await backfillThreadHistoryIfNeeded({
      memory: memory as never,
      userId: 'u1',
      threadId: 't1',
    });

    expect(copied).toBe(1);
    expect(saveMessages).toHaveBeenCalledTimes(1);
    expect(saveMessages.mock.calls[0]?.[0].messages).toEqual([
      expect.objectContaining({ id: 'legacy-2', threadId: 't1', resourceId: 'u1' }),
    ]);
    expect(completeMemoryBackfill).toHaveBeenCalledWith('u1', 't1', 2, expect.any(Date));
    expect(failMemoryBackfill).not.toHaveBeenCalled();
  });
});
