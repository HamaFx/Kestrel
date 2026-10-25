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

import { describe, expect, it, vi } from 'vitest';

import { testProviderKey, validateProviderConfig } from '../src/models/model';

vi.mock('@kestrel/shared/encryption', () => ({
  decryptByok: (_payload: string | null | undefined) => null,
  encryptByok: (payload: unknown) => JSON.stringify(payload),
  configuredProviders: () => [] as string[],
  PROVIDER_IDS: [
    'google',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
    'iamhc',
    'hcnsec',
  ] as const,
  describeByok: () => 'none',
}));

describe('validateProviderConfig & testProviderKey rejection', () => {
  const SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'sa@test-project.iam.gserviceaccount.com',
  });

  it.each<{ label: string; provider: string; key: string; ok: boolean; reason?: RegExp }>([
    {
      label: 'rejects the vertex provider id as removed',
      provider: 'vertex',
      key: 'any-key-here-12345',
      ok: false,
      reason: /Vertex AI has been removed/i,
    },
    {
      label: 'rejects the google-vertex provider id as removed',
      provider: 'google-vertex',
      key: 'any-key-here-12345',
      ok: false,
      reason: /Vertex AI has been removed/i,
    },
    {
      label: 'rejects service account JSON even for other providers',
      provider: 'google',
      key: SERVICE_ACCOUNT_JSON,
      ok: false,
      reason: /service account JSON is not supported/i,
    },
    {
      label: 'rejects keys that are too short',
      provider: 'openai',
      key: 'short',
      ok: false,
      reason: /too short/i,
    },
    {
      label: 'rejects empty or missing keys',
      provider: 'openai',
      key: '   ',
      ok: false,
      reason: /API key is required/i,
    },
    {
      label: 'rejects an Anthropic key provided for OpenAI',
      provider: 'openai',
      key: 'sk-ant-api03-abcdef12345',
      ok: false,
      reason: /Anthropic key provided for OpenAI/i,
    },
    {
      label: 'rejects an OpenAI project key provided for Anthropic',
      provider: 'anthropic',
      key: 'sk-proj-abcdef12345678',
      ok: false,
      reason: /OpenAI project key provided for Anthropic/i,
    },
    {
      label: 'accepts a valid OpenAI project key',
      provider: 'openai',
      key: 'sk-proj-valid-openai-key-12345',
      ok: true,
    },
    {
      label: 'accepts a valid Google Gemini key',
      provider: 'google',
      key: 'AIzaSyValidGeminiKey1234567890',
      ok: true,
    },
    {
      label: 'accepts a valid Anthropic key',
      provider: 'anthropic',
      key: 'sk-ant-valid-anthropic-key-12345',
      ok: true,
    },
  ])('$label', ({ provider, key, ok, reason }) => {
    const result = validateProviderConfig(provider, key);

    expect(result.ok).toBe(ok);
    if (reason) {
      expect(result.reason).toMatch(reason);
    }
  });

  it('testProviderKey uses validateProviderConfig to reject invalid keys', async () => {
    const r = await testProviderKey('google', 'short');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/too short/i);
    }
  });
});
