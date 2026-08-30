import { describe, expect, it, vi } from 'vitest';

import { abortError, withCancellablePostgresQuery } from '../src/query-cancellation';

const end = vi.fn().mockResolvedValue(undefined);
const client = Object.assign(vi.fn(), { end });

vi.mock('postgres', () => ({ default: vi.fn(() => client) }));

describe('withCancellablePostgresQuery', () => {
  it('forwards the abort signal and closes the dedicated connection', async () => {
    const controller = new AbortController();
    const result = await withCancellablePostgresQuery(
      'postgres://localhost/test',
      async (_sql, signal) => {
        expect(signal).toBe(controller.signal);
        return 'ok';
      },
      { signal: controller.signal },
    );

    expect(result).toBe('ok');
    expect(end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('fails before opening a connection when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withCancellablePostgresQuery('postgres://localhost/test', async () => 'never', {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('exposes a standard AbortError', () => {
    expect(abortError()).toMatchObject({ name: 'AbortError' });
  });
});
