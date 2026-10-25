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

// Authenticated Custom Agents HTTP routes — catalog, skills and templates.
//
// Mounted at /api/plugins/custom-agents/<path> by the core dispatcher.

import { pluginHost } from '@kestrel/plugin-sdk';

import {
  CatalogOutputSchema,
  ExtractPdfOutputSchema,
  ImportAgentMarkdownInputSchema,
  ValidateSkillInputSchema,
} from '../../schemas';
import { createAgentForUser } from '../../services/agents';
import {
  listAvailablePluginSkills,
  parseAgentMarkdown,
  validateSkillMarkdown,
} from '../../services/skills';
import { normaliseSettings } from '../../settings';
import { AGENT_TEMPLATES, findAgentTemplate } from '../../templates';
import { ApiError, installedIds, json, parseBody, wrap } from './shared';

export const catalog = wrap(async (ctx) => {
  const settings = normaliseSettings(ctx.settings);
  const ids = await installedIds(ctx.userId);
  const pluginTools = pluginHost.resolveToolsForUser(ids).map((tool) => ({
    name: tool.name,
    description: tool.description,
    access: tool.access,
    group: 'plugins' as const,
    source: 'plugin' as const,
    pluginId: tool.pluginId,
  }));
  const coreTools = pluginHost.getCoreTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    access: tool.access,
    group: tool.group,
    source: 'core' as const,
  }));
  const pluginSkills = listAvailablePluginSkills(ids).map((skill) => ({
    pluginId: skill.pluginId,
    pluginName: skill.pluginName,
    name: skill.name,
    description: skill.description,
  }));
  const payload = CatalogOutputSchema.parse({
    coreTools,
    pluginTools,
    pluginSkills,
    templates: AGENT_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      slug: template.slug,
      description: template.description,
      instructions: template.instructions,
      model: template.model,
      tools: [...template.tools],
      delegatable: template.delegatable,
    })),
    settings: {
      allowWriteTools: settings.allowWriteTools,
      allowMcp: settings.allowMcp,
      maxMcpServers: settings.maxMcpServers,
      maxAgents: settings.maxAgents,
      defaultModel: settings.defaultModel,
    },
  });
  return json(payload);
});

export const validateSkill = wrap(async (ctx) => {
  const input = await parseBody(ctx.request, ValidateSkillInputSchema);
  const result = validateSkillMarkdown(input.content, input.name);
  return json(result);
});

export const extractPdf = wrap(async (ctx) => {
  const contentType = ctx.request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw new ApiError(400, 'Upload a PDF as multipart/form-data.', 'INVALID_UPLOAD');
  }
  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    throw new ApiError(400, 'Could not read the uploaded file.', 'INVALID_UPLOAD');
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new ApiError(400, 'The "file" field is required.', 'MISSING_FILE');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new ApiError(413, 'PDF must be 10 MB or smaller.', 'FILE_TOO_LARGE');
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new ApiError(415, 'Only PDF files are supported.', 'UNSUPPORTED_FILE');
  }

  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text;
    return json(
      ExtractPdfOutputSchema.parse({
        text: String(text ?? '').slice(0, 100_000),
        pages: result.totalPages ?? 0,
      }),
    );
  } catch (err) {
    ctx.log.warn('PDF text extraction failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    throw new ApiError(
      422,
      'Could not extract text from this PDF. Try a text-based PDF or paste the Markdown instead.',
      'PDF_EXTRACTION_FAILED',
    );
  }
});

export const importAgentMarkdown = wrap(async (ctx) => {
  const input = await parseBody(ctx.request, ImportAgentMarkdownInputSchema);
  const parsed = parseAgentMarkdown(input.content);
  if (!parsed) throw new ApiError(400, 'The file is empty or not Markdown.', 'INVALID_AGENT_MD');
  return json(parsed);
});

export const installTemplate = wrap(async (ctx) => {
  const templateId = ctx.params['templateId'];
  const template = templateId ? findAgentTemplate(templateId) : undefined;
  if (!template) throw new ApiError(404, 'Template not found.', 'TEMPLATE_NOT_FOUND');
  const agent = await createAgentForUser({
    userId: ctx.userId,
    installedPluginIds: await installedIds(ctx.userId),
    settings: ctx.settings,
    input: {
      name: template.name,
      slug: template.slug,
      description: template.description,
      instructions: template.instructions,
      model: template.model,
      tools: [...template.tools],
      skills: [],
      skillRefs: [...template.skillRefs],
      mcpServers: [],
      delegatable: template.delegatable,
    },
  });
  return json({ ok: true, message: `Added @${agent.slug}.`, agent }, 201);
});
