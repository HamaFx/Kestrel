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

// `@handle` validation shared by tools, API routes, and the studio UI.

export const AGENT_SLUG_RE = /^[a-z][a-z0-9-]{1,31}$/;

/**
 * Handles that would collide with the core agent surface or read like a
 * command. Kept in sync with the AI package's reserve list.
 */
export const RESERVED_AGENT_SLUGS: ReadonlySet<string> = new Set([
  'agent',
  'assistant',
  'committee',
  'core',
  'kestrel',
  'system',
  'custom-agent',
  'custom-agents',
  'help',
  'start',
  'settings',
]);

/** Turn a free-form name into a safe default handle. */
export function slugifyAgentName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (!slug) return 'agent';
  const withLetter = /^[a-z]/.test(slug) ? slug : `a-${slug}`.slice(0, 32);
  return withLetter.replace(/-+$/g, '') || 'agent';
}

export function validateAgentSlug(slug: string): string | null {
  const value = slug.trim().toLowerCase();
  if (!AGENT_SLUG_RE.test(value)) {
    return 'Handle must be 2–32 lowercase letters, numbers or hyphens, and start with a letter.';
  }
  if (RESERVED_AGENT_SLUGS.has(value)) {
    return `@${value} is reserved by Kestrel. Pick another handle.`;
  }
  return null;
}
