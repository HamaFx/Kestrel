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

import { parseAgentMarkdown, validateSkillMarkdown } from '../src/services/skills';
import { slugifyAgentName, validateAgentSlug } from '../src/slugs';

describe('agent handles', () => {
  it('slugifies names into safe handles', () => {
    expect(slugifyAgentName('ICT Silver Bullet Mentor')).toBe('ict-silver-bullet-mentor');
    expect(slugifyAgentName('  EUR/USD  Pro  ')).toBe('eur-usd-pro');
    expect(slugifyAgentName('123')).toBe('a-123');
    expect(slugifyAgentName('')).toBe('agent');
  });

  it('rejects reserved and malformed handles', () => {
    expect(validateAgentSlug('ict-mentor')).toBeNull();
    expect(validateAgentSlug('Kestrel')).not.toBeNull();
    expect(validateAgentSlug('a')).not.toBeNull();
    expect(validateAgentSlug('bad_slug')).not.toBeNull();
    expect(validateAgentSlug('-leading')).not.toBeNull();
  });
});

describe('SKILL.md validation', () => {
  it('accepts a well-formed skill', () => {
    const result = validateSkillMarkdown(
      [
        '---',
        'name: london-open',
        'description: Use for London open.',
        '---',
        '',
        '# Rules',
        '1. Sweep.',
      ].join('\n'),
    );
    expect(result.valid).toBe(true);
    expect(result.skill?.name).toBe('london-open');
    expect(result.skill?.instructions).toContain('# Rules');
  });

  it('reports missing frontmatter fields instead of throwing', () => {
    const result = validateSkillMarkdown('# No frontmatter\n1. Rule');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('agent markdown import', () => {
  it('reads name, description and body from frontmatter', () => {
    const parsed = parseAgentMarkdown(
      [
        '---',
        'name: Macro Watcher',
        'description: Rates and the dollar.',
        'model: openai:gpt-5',
        '---',
        '',
        'You are a macro analyst.',
      ].join('\n'),
    );
    expect(parsed?.name).toBe('Macro Watcher');
    expect(parsed?.slug).toBe('macro-watcher');
    expect(parsed?.model).toBe('openai:gpt-5');
    expect(parsed?.instructions).toContain('You are a macro analyst.');
  });

  it('falls back to the first heading when frontmatter is absent', () => {
    const parsed = parseAgentMarkdown('# Risk Coach\n\nProtect capital.');
    expect(parsed?.name).toBe('Risk Coach');
    expect(parsed?.instructions).toContain('Protect capital.');
  });
});
