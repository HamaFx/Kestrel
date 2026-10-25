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

import { describe, expect, it } from 'vitest';

import { runAgentScript, ScriptSandboxError } from '../src/services/sandbox';

describe('custom agent script sandbox', () => {
  it('runs a pure calculation and captures logs', async () => {
    const result = await runAgentScript({
      source: `
function run(input) {
  console.log('adding', input);
  return { sum: input.a + input.b, product: input.a * input.b };
}
`,
      input: { a: 3, b: 4 },
    });
    expect(result.result).toEqual({ sum: 7, product: 12 });
    expect(result.logs).toEqual(['log: adding {"a":3,"b":4}']);
  });

  it('does not expose host globals', async () => {
    await expect(
      runAgentScript({
        source: 'function run() { return typeof process + ":" + typeof fetch; }',
      }),
    ).resolves.toMatchObject({ result: 'undefined:undefined' });
  });

  it('rejects code without a run function', async () => {
    await expect(runAgentScript({ source: 'var x = 1;' })).rejects.toBeInstanceOf(
      ScriptSandboxError,
    );
  });

  it('interrupts a runaway loop', async () => {
    await expect(
      runAgentScript({
        source: 'function run() { while (true) {} }',
        timeoutMs: 100,
      }),
    ).rejects.toThrow(/sandbox limits/);
  });
});
