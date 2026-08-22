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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMastraXauusdResearch } from '@/lib/services/mastra-xauusd';

const mocks = vi.hoisted(() => ({
  getThread: vi.fn(),
  getUserWithSettings: vi.fn(),
  getServerEnv: vi.fn(),
  runXauusdMastra: vi.fn(),
}));

vi.mock('@kestrel/db', () => ({
  getThread: mocks.getThread,
  getUserWithSettings: mocks.getUserWithSettings,
}));
vi.mock('@kestrel/ai/mastra', () => ({
  runXauusdMastra: mocks.runXauusdMastra,
}));
vi.mock('@/lib/env', () => ({
  getServerEnv: mocks.getServerEnv,
}));

const input = {
  userId: 'user-1',
  threadId: '550e8400-e29b-41d4-a716-446655440000',
  runId: 'run-1',
  prompt: 'Analyse gold',
};

describe('Mastra XAUUSD service', () => {
  beforeEach(() => {
    mocks.getThread.mockReset().mockResolvedValue({ id: input.threadId });
    mocks.getUserWithSettings.mockReset().mockResolvedValue({
      settings: { aiApiKeys: 'encrypted', chatModel: 'google:gemini-2.5-flash' },
    });
    mocks.getServerEnv.mockReset().mockReturnValue({ AI_DEFAULT_MODEL: 'google/gemini-2.5-flash' });
    mocks.runXauusdMastra.mockReset().mockResolvedValue({ result: { text: 'ok' } });
  });

  it('checks thread ownership before loading settings or running Mastra', async () => {
    await runMastraXauusdResearch(input);

    expect(mocks.getThread).toHaveBeenCalledWith(input.userId, input.threadId);
    expect(mocks.getUserWithSettings).toHaveBeenCalledWith(input.userId);
    expect(mocks.runXauusdMastra).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: input.userId,
        threadId: input.threadId,
        runId: input.runId,
        settings: expect.objectContaining({ chatModel: 'google:gemini-2.5-flash' }),
        env: expect.objectContaining({ AI_DEFAULT_MODEL: 'google/gemini-2.5-flash' }),
      }),
    );
  });

  it('fails closed for a thread owned by another user', async () => {
    mocks.getThread.mockResolvedValue(null);

    await expect(runMastraXauusdResearch(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    expect(mocks.getUserWithSettings).not.toHaveBeenCalled();
    expect(mocks.runXauusdMastra).not.toHaveBeenCalled();
  });
});
