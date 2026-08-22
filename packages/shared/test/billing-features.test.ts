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
  FREE_PLAN_ALERT_LIMIT,
  FREE_PLAN_JOURNAL_MONTHLY_LIMIT,
  hasFeature,
  inferPlanName,
} from '../src/billing/features';

describe('hasFeature', () => {
  it('returns true when feature is in planFeatures', () => {
    expect(hasFeature(['chat_basic', 'chart_basic'], 'chat_basic')).toBe(true);
  });

  it('returns false when feature is not in planFeatures', () => {
    expect(hasFeature(['chat_basic', 'chart_basic'], 'ai_high_quota')).toBe(false);
  });

  it('returns false when planFeatures is null', () => {
    expect(hasFeature(null, 'chat_basic')).toBe(false);
  });

  it('returns false when planFeatures is undefined', () => {
    expect(hasFeature(undefined, 'chat_basic')).toBe(false);
  });

  it('returns false when planFeatures is empty', () => {
    expect(hasFeature([], 'chat_basic')).toBe(false);
  });
});

describe('inferPlanName', () => {
  it('returns "free" for free plan features', () => {
    expect(inferPlanName(['chat_basic', 'chart_basic', 'journal_basic'])).toBe('free');
  });

  it('returns "pro" for pro plan features', () => {
    expect(
      inferPlanName([
        'chat_advanced',
        'chart_advanced',
        'journal_full',
        'alerts_unlimited',
        'ai_high_quota',
      ]),
    ).toBe('pro');
  });

  it('returns "enterprise" for enterprise plan features', () => {
    expect(
      inferPlanName([
        'chat_advanced',
        'chart_advanced',
        'journal_full',
        'alerts_unlimited',
        'ai_unlimited',
        'api_access',
      ]),
    ).toBe('enterprise');
  });

  it('returns "free" when planFeatures is null', () => {
    expect(inferPlanName(null)).toBe('free');
  });

  it('returns "free" when planFeatures is undefined', () => {
    expect(inferPlanName(undefined)).toBe('free');
  });

  it('returns "free" for unknown feature combinations', () => {
    expect(inferPlanName(['unknown_feature'])).toBe('free');
  });

  it('matches pro when features superset', () => {
    const features = [
      'chat_advanced',
      'chart_advanced',
      'journal_full',
      'alerts_unlimited',
      'ai_high_quota',
      'extra_feature',
    ];
    expect(inferPlanName(features)).toBe('pro');
  });
});

describe('constants', () => {
  it('FREE_PLAN_ALERT_LIMIT is 5', () => {
    expect(FREE_PLAN_ALERT_LIMIT).toBe(5);
  });

  it('FREE_PLAN_JOURNAL_MONTHLY_LIMIT is 50', () => {
    expect(FREE_PLAN_JOURNAL_MONTHLY_LIMIT).toBe(50);
  });
});
