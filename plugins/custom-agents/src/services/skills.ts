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

// SKILL.md / .agent.md parsing and installed-plugin skill resolution.
//
// Validation uses Mastra's own `validateSkillContent()` so a knowledge file
// accepted by the Studio is exactly what the agent runtime will accept.

import { pluginHost, type PluginSkillInput } from '@kestrel/plugin-sdk';
import { validateSkillContent } from '@mastra/core/skills';
import { parse as parseYaml } from 'yaml';

import type { CustomSkill, SkillRef } from '../schemas';
import { slugifyAgentName } from '../slugs';

interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

/** Minimal `---` frontmatter split with a strict YAML object parse. */
function splitFrontmatter(content: string): Frontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(content.trim());
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1] ?? '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return { data: parsed as Record<string, unknown>, body: (match[2] ?? '').trim() };
  } catch {
    return null;
  }
}

export interface ParsedSkill {
  valid: boolean;
  errors: string[];
  warnings: string[];
  skill: CustomSkill | null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Accept `provider/model` in imported Markdown but store `provider:model`. */
function normaliseImportedModel(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  if (raw.includes(':')) return raw;
  const slash = raw.indexOf('/');
  return slash > 0 && slash < raw.length - 1
    ? `${raw.slice(0, slash)}:${raw.slice(slash + 1)}`
    : raw;
}

/** Parse and validate a SKILL.md document. */
export function validateSkillMarkdown(content: string, fallbackName?: string): ParsedSkill {
  let result: ReturnType<typeof validateSkillContent>;
  try {
    result = validateSkillContent({ content });
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : 'SKILL.md could not be parsed.'],
      warnings: [],
      skill: null,
    };
  }

  const metadata = (result.metadata ?? {}) as Record<string, unknown>;
  const name = asString(metadata['name']) ?? fallbackName ?? null;
  const description = asString(metadata['description']);
  const instructions = asString(result.instructions) ?? null;
  const errors = [...result.errors];
  if (!name) errors.push('SKILL.md frontmatter requires a name.');
  if (!description) errors.push('SKILL.md frontmatter requires a description.');
  if (!instructions) errors.push('SKILL.md requires an instruction body.');
  if (name && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    errors.push(
      `Skill name "${name}" must be lowercase letters, numbers or hyphens (max 64 characters).`,
    );
  }

  return {
    valid: result.valid && errors.length === 0,
    errors,
    warnings: [...result.warnings],
    skill:
      name && description && instructions
        ? {
            name,
            description,
            instructions,
          }
        : null,
  };
}

export interface ParsedAgentMarkdown {
  name: string;
  slug: string;
  description: string;
  instructions: string;
  model: string | null;
}

/**
 * Parse an `.agent.md` file. Frontmatter is optional; when present it must be
 * a valid SKILL.md-style header. Everything after the header is instructions.
 */
export function parseAgentMarkdown(content: string): ParsedAgentMarkdown | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const frontmatter = splitFrontmatter(trimmed);
  if (frontmatter) {
    const instructions = frontmatter.body;
    if (instructions) {
      const name = asString(frontmatter.data['name']) ?? 'Imported Agent';
      return {
        name,
        slug: slugifyAgentName(asString(frontmatter.data['slug']) ?? name),
        description: asString(frontmatter.data['description']) ?? '',
        instructions,
        model: normaliseImportedModel(frontmatter.data['model']),
      };
    }
  }

  // No usable frontmatter: treat the first heading as the name.
  const heading = /^#\s+(.+)$/m.exec(trimmed);
  const name = heading?.[1]?.trim().slice(0, 120) || 'Imported Agent';
  const body = heading ? trimmed.replace(heading[0], '').trim() : trimmed;
  return {
    name,
    slug: slugifyAgentName(name),
    description: '',
    instructions: body,
    model: null,
  };
}

export interface AvailablePluginSkill {
  pluginId: string;
  pluginName: string;
  name: string;
  description: string;
  skill: PluginSkillInput;
}

function skillNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? normalized;
}

/** Skills shipped by plugins the user has installed. */
export function listAvailablePluginSkills(
  installedPluginIds: readonly string[],
): AvailablePluginSkill[] {
  const out: AvailablePluginSkill[] = [];
  for (const plugin of pluginHost.getInstalledPlugins(installedPluginIds)) {
    for (const skill of plugin.skills) {
      if (typeof skill === 'string') {
        const name = skillNameFromPath(skill);
        out.push({
          pluginId: plugin.manifest.id,
          pluginName: plugin.manifest.name,
          name,
          description: `Playbook from ${plugin.manifest.name}`,
          skill,
        });
      } else {
        out.push({
          pluginId: plugin.manifest.id,
          pluginName: plugin.manifest.name,
          name: skill.name,
          description: skill.description,
          skill,
        });
      }
    }
  }
  return out.sort(
    (a, b) => a.pluginName.localeCompare(b.pluginName) || a.name.localeCompare(b.name),
  );
}

/** Resolve saved `{pluginId, skill}` refs against the current install set. */
export function resolveSkillRefs(
  refs: readonly SkillRef[],
  installedPluginIds: readonly string[],
): PluginSkillInput[] {
  if (refs.length === 0) return [];
  const available = listAvailablePluginSkills(installedPluginIds);
  const out: PluginSkillInput[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const match = available.find(
      (entry) => entry.pluginId === ref.pluginId && entry.name === ref.skill,
    );
    if (!match) continue;
    const key = `${match.pluginId}:${match.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(match.skill);
  }
  return out;
}
