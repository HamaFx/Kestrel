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

// R14 — the XAUUSD research/report path previously had no retry. These tests
// pin the bounded, jittered retry semantics and the structured-output guard
// that keeps the repair loop in charge of schema failures.

import { describe, expect, it, vi } from 'vitest';

import {
  generateXauusdFollowup,
  generateXauusdReport,
} from '../src/mastra-v2/agents/xauusd/report/report-generation';

function fakeAgent(generate: ReturnType<typeof vi.fn>) {
  return { generate } as never;
}

describe('XAUUSD report generation retry (R14)', () => {
  it('retries a transient 503 once and returns the recovered report', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('upstream unavailable'), { statusCode: 503 }))
      .mockResolvedValue({ text: 'recovered report', object: {} });

    const result = await generateXauusdReport(
      fakeAgent(generate),
      'Analyse gold',
      {} as never,
      'google',
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect((result as { text: string }).text).toBe('recovered report');
  });

  it('does not retry deterministic structured-output findings', async () => {
    const issues = [{ path: ['scenarios'], message: 'expected at least two scenarios' }];
    const generate = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('invalid structured output'), { issues }));

    await expect(
      generateXauusdReport(fakeAgent(generate), 'Analyse gold', {} as never, 'google'),
    ).rejects.toThrow('invalid structured output');

    // The repair loop owns schema findings; a blind retry would double spend.
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries a wrapped structured-output rejection through its cause', async () => {
    const cause = { issues: [{ path: ['sources'], message: 'required' }] };
    const generate = vi.fn().mockRejectedValue(Object.assign(new Error('wrapped'), { cause }));

    await expect(
      generateXauusdReport(fakeAgent(generate), 'Analyse gold', {} as never, 'google'),
    ).rejects.toThrow('wrapped');

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries a rate-limited follow-up once and keeps the answer', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValue({ text: 'plain follow-up answer' });

    const result = await generateXauusdFollowup(
      fakeAgent(generate),
      'Explain the report',
      {} as never,
      'google',
      {} as never,
      {} as never,
    );

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('plain follow-up answer');
  });

  it('does not retry a hard 400 on the follow-up path', async () => {
    const generate = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad request'), { statusCode: 400 }));

    await expect(
      generateXauusdFollowup(
        fakeAgent(generate),
        'Explain the report',
        {} as never,
        'google',
        {} as never,
        {} as never,
      ),
    ).rejects.toThrow('bad request');

    expect(generate).toHaveBeenCalledTimes(1);
  });
});
