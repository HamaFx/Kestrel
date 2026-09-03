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

import { readSpecialistStepResult } from '../src/committee/specialist-runner';
import {
  committeeModelMetadata,
  committeeModePolicy,
  committeeProgressStages,
  MastraModeStrictFailureError,
  MODE_POLICY,
  readOnlyMemoryOptions,
  SPECIALISTS_BY_MODE,
} from '../src/committee/types';

describe('committee mode policy (Phase 6)', () => {
  it('keeps Full strict and fail-closed with no partial continuation', () => {
    const full = committeeModePolicy('full');
    expect(full.strict).toBe(true);
    expect(full.continueOnPartialFailure).toBe(false);
    expect(full.specialists).toEqual(['technical', 'fundamental', 'risk', 'sentiment']);

    const error = new MastraModeStrictFailureError(['risk', 'sentiment']);
    expect(error.code).toBe('MASTRA_MODE_INCOMPLETE');
    expect(error.failedAgents).toEqual(['risk', 'sentiment']);
    expect(error.message).toContain('Failed agents: risk, sentiment');
  });

  it('allows Quick/Standard partial continuation (e.g. fundamental failure)', () => {
    expect(committeeModePolicy('single').strict).toBe(false);
    expect(committeeModePolicy('quick').strict).toBe(false);
    expect(committeeModePolicy('quick').continueOnPartialFailure).toBe(true);
    expect(committeeModePolicy('standard').strict).toBe(false);
    expect(committeeModePolicy('standard').continueOnPartialFailure).toBe(true);
  });

  it('never drifts from SPECIALISTS_BY_MODE — mode differences are set, limits, strictness only', () => {
    for (const mode of ['single', 'quick', 'standard', 'full'] as const) {
      expect(MODE_POLICY[mode].specialists).toEqual(SPECIALISTS_BY_MODE[mode]);
    }
  });

  it('exposes one ordered progress stage per run stage', () => {
    expect(committeeProgressStages('full')).toEqual([
      'collect-packet',
      'technical',
      'fundamental',
      'risk',
      'sentiment',
      'verify',
      'fusion',
    ]);
    expect(committeeProgressStages('quick')).toEqual([
      'collect-packet',
      'technical',
      'verify',
      'fusion',
    ]);
  });

  it('standardizes model metadata for specialists and fusion', () => {
    const metadata = committeeModelMetadata(
      'google/gemini-3.6-flash',
      'google',
      { inputTokens: 10, outputTokens: 5, toolCalls: 0, steps: 1 },
      0.001,
      123,
    );
    expect(metadata).toEqual({
      model: 'google/gemini-3.6-flash',
      providerId: 'google',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
      latencyMs: 123,
    });
  });

  it('forces specialist memory read-only without losing thread/resource scope', () => {
    const options = readOnlyMemoryOptions({
      thread: 'thread-1',
      resource: 'user-1',
      options: { lastMessages: 5 },
    });
    expect(options.thread).toBe('thread-1');
    expect(options.resource).toBe('user-1');
    expect(options.options).toEqual({ lastMessages: 5, readOnly: true });
  });

  it('reads specialist step results through the typed schema', () => {
    const getStepResult = (stepId: string) =>
      stepId === 'technical'
        ? {
            ok: true,
            agentName: 'technical',
            opinion: { bias: 'bullish', confidence: 0.7, reasoning: 'trend up' },
            stats: { inputTokens: 1, outputTokens: 1, toolCalls: 0, steps: 1 },
            model: 'test/model',
            providerId: 'test',
            costUsd: 0.001,
            latencyMs: 5,
          }
        : undefined;

    const result = readSpecialistStepResult(getStepResult, 'technical');
    expect(result).toMatchObject({ ok: true, agentName: 'technical' });
    expect(result?.opinion?.bias).toBe('bullish');
    // Unrelated step ids resolve to nothing instead of throwing.
    expect(readSpecialistStepResult(getStepResult, 'risk')).toBeUndefined();
  });
});
