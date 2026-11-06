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

// The AI env schema carries only chat/embedding provider transports; BYOK
// keys live in the encrypted user vault. These tests pin the optional server
// transports and the BYOK payload shape.

import { describe, expect, it } from 'vitest';

import { type ByokPayload } from '../src/crypto/byok';
import { AiEnv } from '../src/env/schema/ai';

describe('AiEnv & ByokPayload', () => {
  it('accepts optional gateway and direct Google keys in AiEnv', () => {
    const parsed = AiEnv.parse({
      AI_GATEWAY_API_KEY: 'gateway-key',
      GOOGLE_GENERATIVE_AI_API_KEY: 'google-key',
    });
    expect(parsed.AI_GATEWAY_API_KEY).toBe('gateway-key');
    expect(parsed.GOOGLE_GENERATIVE_AI_API_KEY).toBe('google-key');
  });

  it('defaults the model ids when no env override is set', () => {
    const parsed = AiEnv.parse({});
    expect(parsed.AI_DEFAULT_MODEL).toBe('google/gemini-3.5-flash');
    expect(parsed.AI_TITLE_MODEL).toBe('google/gemini-3.5-flash-lite');
    expect(parsed.AI_EMBEDDING_MODEL).toBe('openai/text-embedding-3-small');
  });

  it('allows chat provider fields on ByokPayload', () => {
    const payload: ByokPayload = {
      openai: 'sk-key',
      anthropic: 'sk-ant-key',
      deepseek: 'sk-ds-key',
    };
    expect(payload.openai).toBe('sk-key');
    expect(payload.anthropic).toBe('sk-ant-key');
    expect(payload.deepseek).toBe('sk-ds-key');
  });
});
