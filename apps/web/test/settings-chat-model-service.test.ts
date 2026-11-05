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

// `validateAndSaveUserModel` is the one save path shared by the Settings
// server actions and the chat/vision/embedding model routes.
//
// The audit found the action saved any `providerId:modelId` string with none
// of the route's checks (API-key ownership, catalog membership, embedding-tier
// rejection). These tests pin every check at the service boundary so both
// callers inherit them.

import type { ProviderId } from '@kestrel/shared/encryption';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { validateAndSaveUserModel } from '../src/lib/services/settings/chat-model';

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
      supports: { vision: true, embedding: true },
      models: [
        { modelId: 'gpt-chat', tier: 'flagship' },
        { modelId: 'anthropic/claude-sonnet', tier: 'pro' },
        { modelId: 'text-embedding-3', tier: 'embedding' },
      ],
    },
    textonly: {
      supports: { vision: false, embedding: false },
      models: [{ modelId: 'text-chat', tier: 'fast' }],
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

describe('validateAndSaveUserModel', () => {
  it('rejects an unknown provider', async () => {
    await expect(
      validateAndSaveUserModel(USER_ID, 'chat', 'nope' as ProviderId, 'gpt-chat'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a provider with no user API key', async () => {
    mocks.decryptByok.mockReturnValue({});

    await expect(
      validateAndSaveUserModel(USER_ID, 'chat', 'openai', 'gpt-chat'),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'No API key configured for provider: openai',
    });
    expect(mocks.updateUserSettingsField).not.toHaveBeenCalled();
  });

  it('rejects a model outside the provider catalog', async () => {
    await expect(
      validateAndSaveUserModel(USER_ID, 'chat', 'openai', 'gpt-unknown'),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mocks.updateUserSettingsField).not.toHaveBeenCalled();
  });

  it('rejects an embedding-only model for chat', async () => {
    await expect(
      validateAndSaveUserModel(USER_ID, 'chat', 'openai', 'text-embedding-3'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.updateUserSettingsField).not.toHaveBeenCalled();
  });

  it('saves provider:bareModelId and strips a provider-prefixed model id', async () => {
    const result = await validateAndSaveUserModel(USER_ID, 'chat', 'openai', 'gpt-chat');

    expect(result).toEqual({ model: 'openai:gpt-chat' });
    expect(mocks.updateUserSettingsField).toHaveBeenCalledWith(
      USER_ID,
      'chatModel',
      'openai:gpt-chat',
    );

    // Slash-containing catalog ids (OpenRouter-style) survive intact.
    mocks.updateUserSettingsField.mockClear();
    const slash = await validateAndSaveUserModel(
      USER_ID,
      'chat',
      'openai',
      'openai/anthropic/claude-sonnet',
    );
    expect(slash).toEqual({ model: 'openai:anthropic/claude-sonnet' });
  });

  it('rejects a vision model on a provider without vision support', async () => {
    await expect(
      validateAndSaveUserModel(USER_ID, 'vision', 'textonly' as ProviderId, 'text-chat'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.updateUserSettingsField).not.toHaveBeenCalled();
  });

  it('saves an embedding model to the embedding column', async () => {
    const result = await validateAndSaveUserModel(
      USER_ID,
      'embedding',
      'openai',
      'text-embedding-3',
    );

    expect(result).toEqual({ model: 'openai:text-embedding-3' });
    expect(mocks.updateUserSettingsField).toHaveBeenCalledWith(
      USER_ID,
      'embeddingModel',
      'openai:text-embedding-3',
    );
  });
});
