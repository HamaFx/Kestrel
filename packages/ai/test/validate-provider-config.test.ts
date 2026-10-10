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

import { testProviderKey, validateProviderConfig } from '../src/model';

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
  it('rejects vertex provider id as removed', () => {
    const r = validateProviderConfig('vertex', 'any-key-here-12345');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Vertex AI has been removed/i);
  });

  it('rejects google-vertex provider id as removed', () => {
    const r = validateProviderConfig('google-vertex', 'any-key-here-12345');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Vertex AI has been removed/i);
  });

  it('rejects service account JSON even for other providers', () => {
    const saJson = JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      client_email: 'sa@test-project.iam.gserviceaccount.com',
    });
    const r = validateProviderConfig('google', saJson);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/service account JSON is not supported/i);
  });

  it('rejects keys that are too short', () => {
    const r = validateProviderConfig('openai', 'short');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too short/i);
  });

  it('rejects empty or missing keys', () => {
    const r = validateProviderConfig('openai', '   ');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/API key is required/i);
  });

  it('rejects mismatched provider key prefixes', () => {
    const r1 = validateProviderConfig('openai', 'sk-ant-api03-abcdef12345');
    expect(r1.ok).toBe(false);
    expect(r1.reason).toMatch(/Anthropic key provided for OpenAI/i);

    const r2 = validateProviderConfig('anthropic', 'sk-proj-abcdef12345678');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toMatch(/OpenAI project key provided for Anthropic/i);
  });

  it('accepts valid provider configurations', () => {
    const r1 = validateProviderConfig('openai', 'sk-proj-valid-openai-key-12345');
    expect(r1.ok).toBe(true);

    const r2 = validateProviderConfig('google', 'AIzaSyValidGeminiKey1234567890');
    expect(r2.ok).toBe(true);

    const r3 = validateProviderConfig('anthropic', 'sk-ant-valid-anthropic-key-12345');
    expect(r3.ok).toBe(true);
  });

  it('testProviderKey uses validateProviderConfig to reject invalid keys', async () => {
    const r = await testProviderKey('google', 'short');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/too short/i);
    }
  });
});
