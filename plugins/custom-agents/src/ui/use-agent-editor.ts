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

// State + actions for the custom-agent editor. Keeping this outside the
// dialog shell lets each step stay a small presentational component.

import { useEffect, useMemo, useRef, useState } from 'react';

import type { AgentView, CatalogOutput, CustomSkill } from '../schemas';
import { slugifyAgentName, validateAgentSlug } from '../slugs';
import { errorMessage, pluginFetch, pluginUpload } from './api';
import { emptyForm, fromAgent, type FormState, type McpRow } from './editor-types';

export interface UseAgentEditorArgs {
  open: boolean;
  agent: AgentView | null;
  catalog: CatalogOutput;
  onClose: () => void;
  onSaved: (agent: AgentView) => void;
}

export function useAgentEditor({ open, agent, catalog, onClose, onSaved }: UseAgentEditorArgs) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => emptyForm(catalog));
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolQuery, setToolQuery] = useState('');
  const [skillContent, setSkillContent] = useState('');
  const [skillName, setSkillName] = useState('');
  const [skillErrors, setSkillErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const agentMdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError(null);
    setBusy(false);
    setToolQuery('');
    setSkillContent('');
    setSkillName('');
    setSkillErrors([]);
    setSlugTouched(agent !== null);
    setForm(agent ? fromAgent(agent) : emptyForm(catalog));
  }, [open, agent, catalog]);

  const tools = useMemo(() => {
    const all = [
      ...catalog.coreTools,
      ...catalog.pluginTools.map((tool) => ({ ...tool, group: 'plugins' })),
    ];
    const query = toolQuery.trim().toLowerCase();
    return query
      ? all.filter(
          (tool) =>
            tool.name.toLowerCase().includes(query) ||
            tool.description.toLowerCase().includes(query),
        )
      : all;
  }, [catalog, toolQuery]);

  const groupedTools = useMemo(() => {
    const groups = new Map<string, typeof tools>();
    for (const tool of tools) {
      const list = groups.get(tool.group) ?? [];
      list.push(tool);
      groups.set(tool.group, list);
    }
    const order = [
      'market-data',
      'analysis',
      'research',
      'journal',
      'portfolio',
      'system',
      'plugins',
      'other',
    ];
    return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [tools]);

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function toggleTool(name: string) {
    setForm((current) => ({
      ...current,
      tools: current.tools.includes(name)
        ? current.tools.filter((tool) => tool !== name)
        : [...current.tools, name],
    }));
  }

  function toggleSkillRef(pluginId: string, skill: string) {
    const key = `${pluginId}:${skill}`;
    setForm((current) => {
      const exists = current.skillRefs.some((ref) => `${ref.pluginId}:${ref.skill}` === key);
      return {
        ...current,
        skillRefs: exists
          ? current.skillRefs.filter((ref) => `${ref.pluginId}:${ref.skill}` !== key)
          : [...current.skillRefs, { pluginId, skill }],
      };
    });
  }

  async function addSkill() {
    setSkillErrors([]);
    setBusy(true);
    try {
      const result = await pluginFetch<{
        valid: boolean;
        errors: string[];
        warnings: string[];
        skill: CustomSkill | null;
      }>('/skills/validate', {
        method: 'POST',
        body: JSON.stringify({ content: skillContent, ...(skillName ? { name: skillName } : {}) }),
      });
      if (!result.valid || !result.skill) {
        setSkillErrors(result.errors.length > 0 ? result.errors : ['SKILL.md is not valid.']);
        return;
      }
      if (form.skills.some((skill) => skill.name === result.skill!.name)) {
        setSkillErrors([`A skill named "${result.skill.name}" is already attached.`]);
        return;
      }
      patch({ skills: [...form.skills, result.skill] });
      setSkillContent('');
      setSkillName('');
    } catch (err) {
      setSkillErrors([errorMessage(err)]);
    } finally {
      setBusy(false);
    }
  }

  async function uploadSkill(file: File | null) {
    if (!file) return;
    setSkillErrors([]);
    const name = slugifyAgentName(file.name.replace(/\.(md|txt|pdf)$/i, ''));
    setSkillName(name);
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setBusy(true);
      try {
        const formData = new FormData();
        formData.append('file', file, file.name);
        const extracted = await pluginUpload<{ text: string; pages: number }>(
          '/skills/extract',
          formData,
        );
        const instructions = extracted.text.trim().slice(0, 24_000);
        if (!instructions) {
          setSkillErrors(['No text could be extracted from this PDF.']);
          return;
        }
        setSkillContent(
          [
            '---',
            `name: ${name}`,
            `description: Imported from ${file.name} (${extracted.pages} page${extracted.pages === 1 ? '' : 's'}).`,
            '---',
            '',
            instructions,
          ].join('\n'),
        );
      } catch (err) {
        setSkillErrors([errorMessage(err)]);
      } finally {
        setBusy(false);
      }
      return;
    }
    setSkillContent(await file.text());
  }

  async function importAgentMd(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const content = await file.text();
      const parsed = await pluginFetch<{
        name: string;
        slug: string;
        description: string;
        instructions: string;
        model: string | null;
      }>('/import-agent-md', { method: 'POST', body: JSON.stringify({ content }) });
      setForm((current) => ({
        ...current,
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description,
        instructions: parsed.instructions,
        model: parsed.model ?? current.model,
      }));
      setSlugTouched(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function addMcpRow() {
    if (form.mcpServers.length >= catalog.settings.maxMcpServers) return;
    patch({
      mcpServers: [
        ...form.mcpServers,
        {
          id: `mcp-${form.mcpServers.length + 1}`,
          url: '',
          authorization: '',
          hadAuthorization: false,
          removeAuthorization: false,
        },
      ],
    });
  }

  function updateMcpRow(index: number, next: Partial<McpRow>) {
    patch({
      mcpServers: form.mcpServers.map((row, i) => (i === index ? { ...row, ...next } : row)),
    });
  }

  function removeMcpRow(index: number) {
    patch({ mcpServers: form.mcpServers.filter((_, i) => i !== index) });
  }

  async function save() {
    setError(null);
    const slugError = validateAgentSlug(form.slug);
    if (slugError) {
      setError(slugError);
      setStep(0);
      return;
    }
    if (form.instructions.trim().length < 20) {
      setError('System instructions must be at least 20 characters.');
      setStep(0);
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        description: form.description.trim(),
        instructions: form.instructions.trim(),
        model: form.model,
        tools: form.tools,
        skills: form.skills,
        skillRefs: form.skillRefs,
        delegatable: form.delegatable,
        mcpServers: form.mcpServers.map((row) => ({
          id: row.id,
          url: row.url,
          ...(row.removeAuthorization
            ? { authorization: '' }
            : row.authorization
              ? { authorization: row.authorization }
              : {}),
        })),
      };
      const result = agent
        ? await pluginFetch<{ agent: AgentView }>(`/agents/${encodeURIComponent(agent.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : await pluginFetch<{ agent: AgentView }>('/agents', {
            method: 'POST',
            body: JSON.stringify(body),
          });
      onSaved(result.agent);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return {
    agent,
    catalog,
    step,
    setStep,
    form,
    setForm,
    slugTouched,
    setSlugTouched,
    busy,
    error,
    toolQuery,
    setToolQuery,
    skillContent,
    setSkillContent,
    skillName,
    setSkillName,
    skillErrors,
    fileRef,
    agentMdRef,
    groupedTools,
    patch,
    toggleTool,
    toggleSkillRef,
    addSkill,
    uploadSkill,
    importAgentMd,
    addMcpRow,
    updateMcpRow,
    removeMcpRow,
    save,
    onClose,
  };
}

export type AgentEditorController = ReturnType<typeof useAgentEditor>;
