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

// Phase 1 (Jev System One) — the OpenCode Console key (`jev-1.13-free` at
// $0.00) and the direct TypeSafe AI key (`jev-latest`) are env + BYOK
// credentials for the /v1/systemone decision-model client. Jev is not a chat
// LLM, so the keys stay OUT of PROVIDER_IDS and only appear as optional keys
// on the BYOK payload / AI env schema.

import { describe, expect, it } from 'vitest';

import { type ByokPayload } from '../src/byok';
import { AiEnv } from '../src/env/schema/ai';

describe('AiEnv & ByokPayload Jev keys', () => {
  it('accepts optional OPENCODE_API_KEY and TYPESAFE_API_KEY in AiEnv', () => {
    const parsed = AiEnv.parse({
      OPENCODE_API_KEY: 'oc-free-key',
      TYPESAFE_API_KEY: 'ts-live-key',
    });
    expect(parsed.OPENCODE_API_KEY).toBe('oc-free-key');
    expect(parsed.TYPESAFE_API_KEY).toBe('ts-live-key');
  });

  it('accepts an optional JEV_BASE_URL endpoint override', () => {
    const parsed = AiEnv.parse({
      JEV_BASE_URL: 'https://jev.internal.example/v1/systemone',
    });
    expect(parsed.JEV_BASE_URL).toBe('https://jev.internal.example/v1/systemone');
  });

  it('rejects a non-URL JEV_BASE_URL', () => {
    expect(AiEnv.safeParse({ JEV_BASE_URL: 'not-a-url' }).success).toBe(false);
  });

  it('allows opencode and typesafe fields on ByokPayload', () => {
    const payload: ByokPayload = {
      opencode: 'oc-key',
      typesafe: 'ts-key',
    };
    expect(payload.opencode).toBe('oc-key');
    expect(payload.typesafe).toBe('ts-key');
  });

  it('accepts an optional LIQUID_API_KEY in AiEnv', () => {
    const parsed = AiEnv.parse({ LIQUID_API_KEY: 'liquid_test-key' });
    expect(parsed.LIQUID_API_KEY).toBe('liquid_test-key');
  });

  it('allows a liquid field on ByokPayload', () => {
    const payload: ByokPayload = { liquid: 'liquid-byok-key' };
    expect(payload.liquid).toBe('liquid-byok-key');
  });
});
