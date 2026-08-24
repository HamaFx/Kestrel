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

import {
  FullAnalysisBudgetAdmissionError,
  FullAnalysisQuotaExceededError,
  isRetryableAnalysisError,
} from '../src/jobs/multi-agent-analysis';

describe('isRetryableAnalysisError', () => {
  it.each([
    'request timed out',
    'timeout while waiting for provider',
    'fetch failed: ECONNRESET',
    '429 too many requests',
    'temporary connection failure',
    'provider returned 503',
  ])('classifies transient error: %s', (message) => {
    expect(isRetryableAnalysisError(new Error(message))).toBe(true);
  });

  it.each(['invalid user settings', 'thread not found', 'malformed model configuration'])(
    'does not retry permanent error: %s',
    (message) => {
      expect(isRetryableAnalysisError(new Error(message))).toBe(false);
    },
  );

  it('does not treat quota exhaustion as retryable', () => {
    expect(isRetryableAnalysisError(new FullAnalysisQuotaExceededError(5, 5))).toBe(false);
  });

  it('treats budget infrastructure admission failures as retryable', () => {
    expect(isRetryableAnalysisError(new FullAnalysisBudgetAdmissionError(new Error('database timeout')))).toBe(true);
  });

  it('classifies a strict Full-mode error by its preserved underlying cause', () => {
    const error = new Error('Full mode could not complete', {
      cause: new Error('provider request timed out'),
    });

    expect(isRetryableAnalysisError(error)).toBe(true);
  });
});
