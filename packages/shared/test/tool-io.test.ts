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

import { getMessageText, getTextFromParts, isTextPart } from '../src/ai/tool-io';

describe('isTextPart', () => {
  it('returns true for valid text part', () => {
    expect(isTextPart({ type: 'text', text: 'hello' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isTextPart(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isTextPart('string')).toBe(false);
  });

  it('returns false for object without type', () => {
    expect(isTextPart({ text: 'hello' })).toBe(false);
  });

  it('returns false for non-text type', () => {
    expect(isTextPart({ type: 'tool-call', text: 'hello' })).toBe(false);
  });
});

describe('getTextFromParts', () => {
  it('returns empty string for non-array', () => {
    expect(getTextFromParts(null)).toBe('');
    expect(getTextFromParts(undefined)).toBe('');
    expect(getTextFromParts('string')).toBe('');
  });

  it('extracts text from text parts', () => {
    const parts = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];
    expect(getTextFromParts(parts)).toBe('Hello\nWorld');
  });

  it('filters out non-text parts', () => {
    const parts = [
      { type: 'text', text: 'Hello' },
      { type: 'tool-call', toolName: 'get_price' },
      { type: 'text', text: 'World' },
    ];
    expect(getTextFromParts(parts)).toBe('Hello\nWorld');
  });

  it('trims result', () => {
    const parts = [{ type: 'text', text: '  Hello  ' }];
    expect(getTextFromParts(parts)).toBe('Hello');
  });

  it('returns empty string for empty array', () => {
    expect(getTextFromParts([])).toBe('');
  });
});

describe('getMessageText', () => {
  it('extracts text from parts field', () => {
    const msg = { parts: [{ type: 'text', text: 'Hello from parts' }] };
    expect(getMessageText(msg)).toBe('Hello from parts');
  });

  it('falls back to content field when parts is empty', () => {
    const msg = { parts: [], content: 'Hello from content' };
    expect(getMessageText(msg)).toBe('Hello from content');
  });

  it('falls back to text field when parts and content are empty', () => {
    const msg = { parts: [], text: 'Hello from text' };
    expect(getMessageText(msg)).toBe('Hello from text');
  });

  it('prioritizes parts over content', () => {
    const msg = {
      parts: [{ type: 'text', text: 'From parts' }],
      content: 'From content',
    };
    expect(getMessageText(msg)).toBe('From parts');
  });

  it('returns empty string when all fields are missing', () => {
    expect(getMessageText({})).toBe('');
  });

  it('returns empty string when content is not a string', () => {
    const msg = { parts: [], content: 42 };
    expect(getMessageText(msg)).toBe('');
  });
});
