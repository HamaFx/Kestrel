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

// Phase 4 Task 2 — the single native Mastra tool suite. Every read-only tool
// the capability manifest exposes must resolve from `nativeCanonicalTools()`
// with no runtime legacy adaptation step.

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
  SENSITIVE_USER_READ_TOOL_NAMES,
} from '../src/mastra-v2/capabilities';
import { MastraMutationNameSchema } from '../src/mastra-v2/mutation/mutation-policy';
import { nativeCanonicalTools } from '../src/mastra-v2/tools/canonical';

describe('native Mastra read-only tool registration', () => {
  it('registers every canonical and sensitive read-only tool natively without legacy adaptation', () => {
    const native = nativeCanonicalTools();
    for (const name of [
      ...CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
      ...SENSITIVE_USER_READ_TOOL_NAMES,
    ]) {
      expect(native[name], `Missing native Mastra tool for ${name}`).toBeDefined();
    }
  });

  it('registers every native tool as an executable Mastra tool with a description', () => {
    for (const [name, tool] of Object.entries(nativeCanonicalTools())) {
      const candidate = tool as { id?: string; description?: string; execute?: unknown };
      expect(candidate.id, `${name} must expose a Mastra id`).toBe(`kestrel-${name}`);
      expect(candidate.description, `${name} must expose a description`).toBeTruthy();
      expect(typeof candidate.execute, `${name} must expose an execute function`).toBe('function');
    }
  });

  it('never registers a mutation tool in the native read-only suite', () => {
    const native = nativeCanonicalTools();
    for (const name of Object.keys(native)) {
      expect(
        MastraMutationNameSchema.safeParse(name).success,
        `${name} is a mutation tool and must not be registered natively`,
      ).toBe(false);
    }
  });
});
