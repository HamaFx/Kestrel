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

// Phase 3 Task 3 — `validateAndSaveChatModel` is the one save path shared by
// the Settings server action and `PUT /api/settings/chat-model`.
//
// The audit found the action saved any `providerId:modelId` string with none
// of the route's checks (API-key ownership, catalog membership, embedding-tier
// rejection). These tests pin every check at the service boundary so both
// callers inherit them.

import type { ProviderId } from '@kestrel/shared/encryption';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAndSaveChatModel } from '../src/lib/services/settings/chat-model';

const mocks = vi.hoisted(() => ({
  getUserWithSettings: vi.fn(),
  updateUserSettingsField: vi.fn(),
  decryptByok: vi.fn(),
}));

vi.mock('@kestrel/db', () => ({
  getUserWithSettings: mocks.getUserWithSettings,
  updateUserSettingsField: mocks.updateUserSettingsField,
}));

// Small deterministic catalog; no dependence on the live provider registry.
vi.mock('@kestrel/ai', () => ({
  BYOK_PROVIDERS: {
    openai: {
      models: [
        { modelId: 'gpt-chat', tier: 'flagship' },
        { modelId: 'anthropic/claude-sonnet', tier: 'pro' },
        { modelId: 'text-embedding-3', tier: 'embedding' },
      ],
    },
  },
}));

vi.mock('@kestrel/shared/encryption', () => ({
  decryptByok: mocks.decryptByok,
}));

const USER_ID = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserWithSettings.mockResolvedValue({ settings: { aiApiKeys: 'enc' } });
  mocks.decryptByok.mockReturnValue({ openai: 'sk-test' });
  mocks.updateUserSettingsField.mockResolvedValue(undefined);
});

describe('validateAndSaveChatModel', () => {
  it('rejects an unknown provider', async () => {
    await expect(
      validateAndSaveChatModel(USER_ID, 'nope' as ProviderId, 'gpt-chat'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a provider with no user API key', async () => {
    mocks.decryptByok.mockReturnValue({});

    await expect(validateAndSaveChatModel(USER_ID, 'openai', 'gpt-chat')).rejects.toMatchObject({
      statusCode: 403,
      message: 'No API key configured for provider: openai',
    });
    expect(mocks.updateUserSettingsField).not.toHaveBeenCalled();
  });

  it('rejects a model outside the provider catalog', async () => {
    await expect(validateAndSaveChatModel(USER_ID, 'openai', 'gpt-unknown')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mocks.updateUserSettingsField).not.toHaveBeenCalled();
  });

  it('rejects an embedding-only model for chat', async () => {
    await expect(
      validateAndSaveChatModel(USER_ID, 'openai', 'text-embedding-3'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.updateUserSettingsField).not.toHaveBeenCalled();
  });

  it('saves provider:bareModelId and strips a provider-prefixed model id', async () => {
    const result = await validateAndSaveChatModel(USER_ID, 'openai', 'gpt-chat');

    expect(result).toEqual({ chatModel: 'openai:gpt-chat' });
    expect(mocks.updateUserSettingsField).toHaveBeenCalledWith(
      USER_ID,
      'chatModel',
      'openai:gpt-chat',
    );

    // Slash-containing catalog ids (OpenRouter-style) survive intact.
    mocks.updateUserSettingsField.mockClear();
    const slash = await validateAndSaveChatModel(
      USER_ID,
      'openai',
      'openai/anthropic/claude-sonnet',
    );
    expect(slash).toEqual({ chatModel: 'openai:anthropic/claude-sonnet' });
  });
});
