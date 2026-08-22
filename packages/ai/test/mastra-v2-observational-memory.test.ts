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

// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest';

import { kestrelMemoryOptions } from '../src/mastra-v2/memory';

const ENV = {} as never;

describe('kestrelMemoryOptions forceObservationalMemory', () => {
  afterEach(() => {
    delete process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
  });

  it('keeps observational memory off by default', () => {
    delete process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
    const options = kestrelMemoryOptions({ env: ENV });
    expect(options.observationalMemory).toBe(false);
  });

  it('enables observational memory when forceObservationalMemory is true', () => {
    delete process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
    const options = kestrelMemoryOptions({ env: ENV, forceObservationalMemory: true });
    expect(options.observationalMemory).toEqual({ scope: 'resource' });
  });

  it('enables observational memory when env var is set', () => {
    process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY = 'true';
    const options = kestrelMemoryOptions({ env: ENV });
    expect(options.observationalMemory).toEqual({ scope: 'resource' });
  });

  it('forceObservationalMemory takes priority over env=false', () => {
    process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY = 'false';
    const options = kestrelMemoryOptions({ env: ENV, forceObservationalMemory: true });
    expect(options.observationalMemory).toEqual({ scope: 'resource' });
  });

  it('semantic recall stays on by default', () => {
    delete process.env.ENABLE_MASTRA_SEMANTIC_RECALL;
    const options = kestrelMemoryOptions({ env: ENV });
    expect(options.semanticRecall).not.toBe(false);
  });

  it('working memory is always enabled and resource-scoped', () => {
    const options = kestrelMemoryOptions({ env: ENV, forceObservationalMemory: true });
    expect(options.workingMemory).toEqual({
      enabled: true,
      scope: 'resource',
      template: expect.any(String),
    });
  });
});
