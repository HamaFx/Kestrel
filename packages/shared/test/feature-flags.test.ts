// SPDX-License-Identifier: Apache-2.0

// M-02 rollout gate (audit 2026-10-18, Phase 0): ENABLE_GENERIC_MACRO must be
// safe to merge in production before the packet is blessed, while still being
// exercised in dev/test. A test that only asserted "default is true" would not
// encode the failure this gate prevents (generic macro silently enabled on a
// production instance that never opted in).

import { afterEach, describe, expect, it } from 'vitest';

import { readFeatureFlag } from '../src/feature-flags';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  delete process.env.ENABLE_GENERIC_MACRO;
});

describe('readFeatureFlag — ENABLE_GENERIC_MACRO rollout gate', () => {
  it('defaults on in every environment now that M-02 has landed', () => {
    process.env.NODE_ENV = 'development';
    expect(readFeatureFlag('ENABLE_GENERIC_MACRO')).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(readFeatureFlag('ENABLE_GENERIC_MACRO')).toBe(true);
  });

  it('lets an explicit 0 roll the packet back in every environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_GENERIC_MACRO = '0';
    expect(readFeatureFlag('ENABLE_GENERIC_MACRO')).toBe(false);
  });
});

describe('readFeatureFlag — static defaults', () => {
  it('keeps the pre-existing flag defaults unchanged', () => {
    delete process.env.PHASE2_PACKET_CACHE;
    delete process.env.ENABLE_COMMITTEE_CRITIQUE;
    expect(readFeatureFlag('PHASE2_PACKET_CACHE')).toBe(true);
    expect(readFeatureFlag('ENABLE_COMMITTEE_CRITIQUE')).toBe(true);
    expect(readFeatureFlag('ENABLE_COMMITTEE_DEBATE')).toBe(false);
  });

  it('defaults the comparison risk desk on with an explicit opt-out', () => {
    delete process.env.ENABLE_COMPARISON_RISK_DESK;
    expect(readFeatureFlag('ENABLE_COMPARISON_RISK_DESK')).toBe(true);
    process.env.ENABLE_COMPARISON_RISK_DESK = '0';
    expect(readFeatureFlag('ENABLE_COMPARISON_RISK_DESK')).toBe(false);
  });
});
