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

// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  modelLabelFromSelection,
  modelSelectionMatches,
  toChatModelValue,
  toQualifiedModelId,
} from '@/components/chat/_components/model-picker-utils';

describe('chat model picker identifiers', () => {
  it('preserves slash-containing gateway model ids', () => {
    expect(toChatModelValue('openrouter', 'anthropic/claude-sonnet-5')).toBe(
      'openrouter:anthropic/claude-sonnet-5',
    );
    expect(toQualifiedModelId('openrouter', 'anthropic/claude-sonnet-5')).toBe(
      'openrouter/anthropic/claude-sonnet-5',
    );
  });

  it('matches canonical, qualified, Vertex, and legacy selections', () => {
    expect(
      modelSelectionMatches(
        'openrouter:anthropic/claude-sonnet-5',
        'openrouter',
        'anthropic/claude-sonnet-5',
      ),
    ).toBe(true);
    expect(
      modelSelectionMatches(
        'openrouter/anthropic/claude-sonnet-5',
        'openrouter',
        'anthropic/claude-sonnet-5',
      ),
    ).toBe(true);
    expect(modelSelectionMatches('vertex:gemini-2.5-pro', 'vertex', 'gemini-2.5-pro')).toBe(true);
    expect(modelSelectionMatches('google-vertex/gemini-2.5-pro', 'vertex', 'gemini-2.5-pro')).toBe(
      true,
    );
    expect(
      modelSelectionMatches(
        'openrouter:claude-sonnet-5',
        'openrouter',
        'anthropic/claude-sonnet-5',
      ),
    ).toBe(true);
  });

  it('does not match a different provider or model', () => {
    expect(modelSelectionMatches('openai:gpt-5', 'openrouter', 'anthropic/claude-sonnet-5')).toBe(
      false,
    );
    expect(
      modelSelectionMatches(
        'openrouter:anthropic/claude-opus-4-8',
        'openrouter',
        'anthropic/claude-sonnet-5',
      ),
    ).toBe(false);
  });

  it('formats the selected model for the compact chat toolbar', () => {
    expect(modelLabelFromSelection('openrouter:anthropic/claude-sonnet-5')).toBe(
      'anthropic/claude-sonnet-5',
    );
    expect(modelLabelFromSelection(null)).toBe('Model');
  });
});
