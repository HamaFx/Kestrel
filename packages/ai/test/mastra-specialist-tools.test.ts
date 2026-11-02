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

// Phase 4 Task 2 — specialist desks resolve their dedicated read-only toolset
// from the single native Mastra suite. The legacy adaptation path is gone, so
// a name without a native registration must be dropped, never wrapped at
// runtime.

import { describe, expect, it } from 'vitest';

import { resolveSpecialistDeskTools, SPECIALIST_DEFINITIONS } from '../src/committee/specialists';
import { resolveNativeCanonicalTool } from '../src/mastra-v2/tools/canonical';

describe('Mastra specialist desk tools', () => {
  it('resolves every specialist desk name from the native Mastra suite', () => {
    for (const definition of Object.values(SPECIALIST_DEFINITIONS)) {
      const tools = resolveSpecialistDeskTools(definition.name);
      for (const name of definition.toolNames) {
        const native = resolveNativeCanonicalTool(name);
        expect(native, `Missing native Mastra tool for ${name}`).not.toBeNull();
        expect(tools[name], `${definition.name} did not resolve ${name}`).toBe(native);
      }
    }
  });

  it('keeps the desk composition order and drops disabled tools', () => {
    const definition = SPECIALIST_DEFINITIONS.technical;
    const [disabled] = definition.toolNames;
    const tools = resolveSpecialistDeskTools('technical', [disabled!]);
    expect(tools[disabled!]).toBeUndefined();
    expect(Object.keys(tools)).toEqual(definition.toolNames.filter((t) => t !== disabled));
  });

  it('never resolves a name without a native registration', () => {
    for (const definition of Object.values(SPECIALIST_DEFINITIONS)) {
      const tools = resolveSpecialistDeskTools(definition.name);
      for (const name of Object.keys(tools)) {
        expect(
          resolveNativeCanonicalTool(name),
          `${name} resolved without a native registration`,
        ).not.toBeNull();
      }
    }
  });
});
