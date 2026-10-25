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

// Custom Agents tool/API schemas.

import { z } from 'zod';

export const AgentSlugSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(
    /^[a-z][a-z0-9-]{1,31}$/,
    'Handle must be 2–32 lowercase letters, numbers or hyphens, and start with a letter.',
  );

export const CustomSkillSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9][a-z0-9-]{0,63}$/,
      'Skill names must be lowercase letters, numbers or hyphens.',
    ),
  description: z.string().min(1).max(500),
  instructions: z.string().min(1).max(24_000),
  references: z.record(z.string(), z.string().max(24_000)).optional(),
});

export type CustomSkill = z.infer<typeof CustomSkillSchema>;

export const SkillRefSchema = z.object({
  pluginId: z.string().min(1).max(64),
  skill: z.string().min(1).max(64),
});

export type SkillRef = z.infer<typeof SkillRefSchema>;

export const McpServerInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9-]{0,31}$/, 'MCP server ids must be lowercase kebab-case.'),
  url: z.url().max(2_000),
  /**
   * `undefined` preserves an existing token on update; an empty string clears
   * it. Values are encrypted at rest and never returned to the browser.
   */
  authorization: z.string().max(4_000).optional(),
});

export type McpServerInput = z.infer<typeof McpServerInputSchema>;

export const McpServerViewSchema = z.object({
  id: z.string(),
  url: z.string(),
  hasAuthorization: z.boolean(),
});

export const AgentViewSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  model: z.string().nullable(),
  tools: z.array(z.string()),
  skills: z.array(CustomSkillSchema),
  skillRefs: z.array(SkillRefSchema),
  mcpServers: z.array(McpServerViewSchema),
  delegatable: z.boolean(),
  starterTemplate: z.string().nullable(),
  runCount: z.number().int(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentView = z.infer<typeof AgentViewSchema>;

// ── Tools ────────────────────────────────────────────────────────────────

export const ListAgentsInputSchema = z.object({
  query: z.string().max(120).optional(),
  delegatableOnly: z.boolean().default(false),
});

export const ListAgentsOutputSchema = z.object({
  agents: z.array(AgentViewSchema),
  count: z.number().int(),
});

export const GetAgentInputSchema = z.object({
  slug: AgentSlugSchema,
});

export const GetAgentOutputSchema = z.object({
  agent: AgentViewSchema,
});

export const CreateAgentInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: AgentSlugSchema.optional(),
  description: z.string().max(1_000).default(''),
  instructions: z.string().min(20).max(24_000),
  model: z.string().max(160).nullable().optional(),
  tools: z.array(z.string().max(80)).max(40).default([]),
  skills: z.array(CustomSkillSchema).max(12).default([]),
  skillRefs: z.array(SkillRefSchema).max(24).default([]),
  mcpServers: z.array(McpServerInputSchema).max(5).default([]),
  delegatable: z.boolean().default(false),
});

export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;

export const UpdateAgentInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: AgentSlugSchema.optional(),
    description: z.string().max(1_000).optional(),
    instructions: z.string().min(20).max(24_000).optional(),
    model: z.string().max(160).nullable().optional(),
    tools: z.array(z.string().max(80)).max(40).optional(),
    skills: z.array(CustomSkillSchema).max(12).optional(),
    skillRefs: z.array(SkillRefSchema).max(24).optional(),
    mcpServers: z.array(McpServerInputSchema).max(5).optional(),
    delegatable: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateAgentInput = z.infer<typeof UpdateAgentInputSchema>;

export const DeleteAgentOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

export const CreateAgentOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  agent: AgentViewSchema,
});

export const UpdateAgentToolInputSchema = z.object({
  agent: AgentSlugSchema,
  name: z.string().min(1).max(120).optional(),
  slug: AgentSlugSchema.optional(),
  description: z.string().max(1_000).optional(),
  instructions: z.string().min(20).max(24_000).optional(),
  model: z.string().max(160).nullable().optional(),
  tools: z.array(z.string().max(80)).max(40).optional(),
  skills: z.array(CustomSkillSchema).max(12).optional(),
  skillRefs: z.array(SkillRefSchema).max(24).optional(),
  mcpServers: z.array(McpServerInputSchema).max(5).optional(),
  delegatable: z.boolean().optional(),
});

export const DeleteAgentToolInputSchema = z.object({
  agent: AgentSlugSchema,
});

// ── API-only schemas ─────────────────────────────────────────────────────

export const ValidateSkillInputSchema = z.object({
  content: z.string().min(1).max(32_000),
  /** Optional fallback name when the frontmatter omits one. */
  name: z.string().max(64).optional(),
});

export const ValidateSkillOutputSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  skill: CustomSkillSchema.nullable(),
});

export const ImportAgentMarkdownInputSchema = z.object({
  content: z.string().min(1).max(48_000),
});

export const ImportAgentMarkdownOutputSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  instructions: z.string(),
  model: z.string().nullable(),
});

export const CatalogOutputSchema = z.object({
  coreTools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      access: z.enum(['read-only', 'sensitive-read', 'write']),
      group: z.string(),
      source: z.literal('core'),
    }),
  ),
  pluginTools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      access: z.enum(['read-only', 'sensitive-read', 'write']),
      group: z.literal('plugins'),
      source: z.literal('plugin'),
      pluginId: z.string(),
    }),
  ),
  pluginSkills: z.array(
    z.object({
      pluginId: z.string(),
      pluginName: z.string(),
      name: z.string(),
      description: z.string(),
    }),
  ),
  templates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      description: z.string(),
      instructions: z.string(),
      model: z.string().nullable(),
      tools: z.array(z.string()),
      delegatable: z.boolean(),
    }),
  ),
  settings: z.object({
    allowWriteTools: z.boolean(),
    allowMcp: z.boolean(),
    maxMcpServers: z.number().int(),
    maxAgents: z.number().int(),
    defaultModel: z.string(),
  }),
});

export type CatalogOutput = z.infer<typeof CatalogOutputSchema>;

export const InstallTemplateInputSchema = z.object({
  templateId: z.string().min(1).max(64),
});
