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
  resolveSpecialistDeskTools,
  SPECIALIST_DESK_TOOL_NAMES,
} from '../src/committee/specialists';
import { getAvailableProviders } from '../src/model-role';

describe('resolveSpecialistDeskTools tool filtering (P1-04)', () => {
  it('returns all desk tools when disabledTools is empty or omitted', () => {
    const technicalTools = resolveSpecialistDeskTools('technical');
    const expectedTechnical = SPECIALIST_DESK_TOOL_NAMES.technical;
    for (const toolName of expectedTechnical) {
      expect(technicalTools[toolName]).toBeDefined();
    }
  });

  it('filters out disabled tools from specialist desk toolset', () => {
    const disabled = ['analyze_technical', 'get_indicators'];
    const technicalTools = resolveSpecialistDeskTools('technical', disabled);

    expect(technicalTools.analyze_technical).toBeUndefined();
    expect(technicalTools.get_indicators).toBeUndefined();
    expect(technicalTools.get_candles).toBeDefined();
    expect(technicalTools.get_price).toBeDefined();
  });

  it('filters sentiment desk tools when disabled', () => {
    const disabled = ['get_news'];
    const sentimentTools = resolveSpecialistDeskTools('sentiment', disabled);

    expect(sentimentTools.get_news).toBeUndefined();
    expect(sentimentTools.get_cot).toBeDefined();
  });
});

describe('getAvailableProviders (P1-03)', () => {
  it('prioritizes providers according to userSettings.aiFallbackChain', () => {
    const keys = {
      google: 'key-g',
      anthropic: 'key-a',
      openai: 'key-o',
    };

    const defaultOrder = getAvailableProviders(keys);
    expect(defaultOrder[0]).toBe('google');

    const customOrder = getAvailableProviders(keys, {
      aiFallbackChain: ['openai', 'anthropic', 'google'],
    });
    expect(customOrder).toEqual(['openai', 'anthropic', 'google']);
  });

  it('filters out unconfigured providers even if specified in aiFallbackChain', () => {
    const keys = {
      google: 'key-g',
      openai: 'key-o',
    };

    const order = getAvailableProviders(keys, {
      aiFallbackChain: ['anthropic', 'openai', 'google'],
    });
    expect(order).toEqual(['openai', 'google']);
  });
});
