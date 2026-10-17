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

import { AppError, ERROR_PATTERNS, findErrorPattern, type ErrorCode } from '../src';

describe('ERROR_PATTERNS', () => {
  it('contains patterns for common operational errors', () => {
    const codes = ERROR_PATTERNS.map((p) => p.code).filter(Boolean);
    expect(codes).toContain('BUDGET_EXCEEDED');
    expect(codes).toContain('UNAUTHORIZED');
    expect(codes).toContain('FORBIDDEN');
    expect(codes).toContain('PROVIDER_UNAVAILABLE');
  });

  it('every pattern has a description and suggested fix', () => {
    for (const pattern of ERROR_PATTERNS) {
      expect(pattern.description).toBeTruthy();
      expect(pattern.suggestedFix).toBeTruthy();
      expect(pattern.relatedFiles).toBeInstanceOf(Array);
      expect(typeof pattern.retryable).toBe('boolean');
    }
  });
});

describe('findErrorPattern', () => {
  it('returns null for unknown errors', () => {
    expect(findErrorPattern(new Error('Some random error'))).toBeNull();
    expect(findErrorPattern('unknown failure')).toBeNull();
  });

  it.each<{
    label: string;
    error: unknown;
    expectedCode: ErrorCode | null;
    expectedRetryable: boolean;
    expectedDescription?: string;
  }>([
    {
      label: 'by error code (BUDGET_EXCEEDED)',
      error: new AppError('BUDGET_EXCEEDED', 'Daily AI budget exceeded', 503),
      expectedCode: 'BUDGET_EXCEEDED',
      expectedRetryable: false,
    },
    {
      label: 'by onboarding message substring',
      error: new Error('User settings not found during onboarding'),
      expectedCode: null,
      expectedRetryable: false,
      expectedDescription: 'User has not completed onboarding',
    },
    {
      label: 'by CSRF regex',
      error: new Error('CSRF token missing or invalid'),
      expectedCode: null,
      expectedRetryable: false,
      expectedDescription: 'CSRF token validation failed',
    },
    {
      label: 'provider unavailable errors',
      error: new Error('provider unavailable: BiQuote returned 500'),
      expectedCode: 'PROVIDER_UNAVAILABLE',
      expectedRetryable: true,
    },
    {
      label: 'unauthorized errors',
      error: new Error('UNAUTHORIZED: session expired'),
      expectedCode: 'UNAUTHORIZED',
      expectedRetryable: false,
    },
    {
      label: 'forbidden errors',
      error: new Error('Forbidden: admin access required'),
      expectedCode: 'FORBIDDEN',
      expectedRetryable: false,
    },
    {
      label: 'rate limited errors',
      error: new AppError('RATE_LIMITED', 'Too Many Requests', 429),
      expectedCode: 'RATE_LIMITED',
      expectedRetryable: true,
    },
    {
      label: 'validation errors',
      error: new AppError('VALIDATION', 'Invalid input', 400),
      expectedCode: 'VALIDATION',
      expectedRetryable: false,
    },
    {
      label: 'internal errors',
      error: new AppError('INTERNAL', 'Unexpected failure', 500),
      expectedCode: 'INTERNAL',
      expectedRetryable: false,
    },
  ])('matches $label', ({ error, expectedCode, expectedRetryable, expectedDescription }) => {
    const pattern = findErrorPattern(error);

    expect(pattern).not.toBeNull();
    expect(pattern?.retryable).toBe(expectedRetryable);
    if (expectedCode === null) {
      expect(pattern?.code).toBeUndefined();
    } else {
      expect(pattern?.code).toBe(expectedCode);
    }
    if (expectedDescription !== undefined) {
      expect(pattern?.description).toBe(expectedDescription);
    }
  });
});
