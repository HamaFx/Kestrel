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

import { afterEach, describe, expect, it, vi } from 'vitest';

import { envFallbackKeys } from '../src/model-helpers';

const PROCESS_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'OPENROUTER_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'IAMHC_API_KEY',
  'HCNSEC_API_KEY',
] as const;

function withoutProcessKeys(): () => void {
  const saved = new Map<string, string | undefined>();
  for (const key of PROCESS_ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  return () => {
    for (const key of PROCESS_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe('envFallbackKeys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces GOOGLE_GENERATIVE_AI_API_KEY as google key', () => {
    const restore = withoutProcessKeys();
    try {
      const keys = envFallbackKeys({
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key',
      });
      expect(keys.google).toBe('test-google-key');
    } finally {
      restore();
    }
  });

  it('surfaces process.env operator keys', () => {
    const restore = withoutProcessKeys();
    try {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      process.env.MISTRAL_API_KEY = 'mistral-key';
      const keys = envFallbackKeys({});
      expect(keys.openai).toBe('openai-key');
      expect(keys.anthropic).toBe('anthropic-key');
      expect(keys.mistral).toBe('mistral-key');
      expect(keys.google).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('does not surface empty or undefined keys', () => {
    const restore = withoutProcessKeys();
    try {
      process.env.OPENAI_API_KEY = '';
      const keys = envFallbackKeys({});
      expect(keys.openai).toBeUndefined();
    } finally {
      restore();
    }
  });
});
