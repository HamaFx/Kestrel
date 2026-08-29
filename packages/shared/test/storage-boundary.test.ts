import { describe, expect, it } from 'vitest';

import { deleteStorageObjects, listStorageObjects } from '@kestrel/data/adapters/storage';

describe('storage adapter boundaries', () => {
  it('rejects insecure production storage URLs before making a request', async () => {
    await expect(
      listStorageObjects(
        {
          SUPABASE_URL: 'http://storage.example.com',
          SUPABASE_SERVICE_ROLE_KEY: 'secret',
        },
        'chat-images',
        '2026-01-01',
      ),
    ).rejects.toThrow(/HTTPS/);
  });

  it('rejects empty, oversized, or traversal delete batches', async () => {
    const env = {
      SUPABASE_URL: 'https://storage.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    };
    await expect(deleteStorageObjects(env, 'chat-images', [])).rejects.toThrow(/path count/);
    await expect(deleteStorageObjects(env, 'chat-images', ['../outside'])).rejects.toThrow(
      /path is invalid/,
    );
    await expect(deleteStorageObjects(env, 'chat-images', ['/absolute'])).rejects.toThrow(
      /path is invalid/,
    );
  });
});
