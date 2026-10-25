'use client';

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
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconFileImport,
  IconLoader2,
  IconPlus,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AgentView, CatalogOutput, CustomSkill } from '../schemas';
import { slugifyAgentName, validateAgentSlug } from '../slugs';
import { errorMessage, pluginFetch, pluginUpload } from './api';
import { ModelSelect } from './model-select';

interface McpRow {
  id: string;
  url: string;
  authorization: string;
  hadAuthorization: boolean;
  removeAuthorization: boolean;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  instructions: string;
  model: string | null;
  tools: string[];
  skills: CustomSkill[];
  skillRefs: Array<{ pluginId: string; skill: string }>;
  mcpServers: McpRow[];
  delegatable: boolean;
}

const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 w-full rounded-md border px-2.5 py-2 text-xs outline-none';

const TOOL_GROUP_LABELS: Record<string, string> = {
  'market-data': 'Market data',
  analysis: 'Analysis & risk',
  research: 'Research',
  journal: 'Journal',
  portfolio: 'Portfolio',
  system: 'System',
  plugins: 'Installed plugin tools',
  other: 'Other',
};

function emptyForm(catalog: CatalogOutput): FormState {
  return {
    name: '',
    slug: '',
    description: '',
    instructions: '',
    model: catalog.settings.defaultModel || null,
    tools: ['get_price', 'get_market_structure', 'get_indicators', 'get_news', 'search_knowledge'],
    skills: [],
    skillRefs: [],
    mcpServers: [],
    delegatable: false,
  };
}

function fromAgent(agent: AgentView): FormState {
  return {
    name: agent.name,
    slug: agent.slug,
    description: agent.description,
    instructions: agent.instructions,
    model: agent.model,
    tools: [...agent.tools],
    skills: agent.skills.map((skill) => ({ ...skill })),
    skillRefs: agent.skillRefs.map((ref) => ({ ...ref })),
    mcpServers: agent.mcpServers.map((server) => ({
      id: server.id,
      url: server.url,
      authorization: '',
      hadAuthorization: server.hasAuthorization,
      removeAuthorization: false,
    })),
    delegatable: agent.delegatable,
  };
}

export function AgentEditor({
  open,
  agent,
  catalog,
  onClose,
  onSaved,
}: {
  open: boolean;
  agent: AgentView | null;
  catalog: CatalogOutput;
  onClose: () => void;
  onSaved: (agent: AgentView) => void;
}) {
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

  if (!open) return null;

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
        const form = new FormData();
        form.append('file', file, file.name);
        const extracted = await pluginUpload<{ text: string; pages: number }>(
          '/skills/extract',
          form,
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-editor-title"
        className="bg-bg-elev-1 border-border flex max-h-[92svh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border shadow-2xl sm:rounded-2xl"
      >
        <header className="border-border/60 flex items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 id="agent-editor-title" className="text-fg text-sm font-semibold">
              {agent ? `Edit @${agent.slug}` : 'New custom agent'}
            </h2>
            <p className="text-fg-subtle text-[11px]">
              Step {step + 1} of 3 ·{' '}
              {['Identity & instructions', 'Skills & knowledge', 'Tools & access'][step]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close editor"
            className="text-fg-subtle hover:text-fg inline-flex size-8 items-center justify-center rounded-md disabled:opacity-50"
          >
            <IconX className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <div className="border-danger/30 bg-danger/5 text-danger mb-3 flex items-start gap-2 rounded-md border p-2.5 text-[11px]">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {step === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-fg text-[11px] font-semibold">Name</span>
                  <input
                    value={form.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setForm((current) => ({
                        ...current,
                        name,
                        slug: slugTouched ? current.slug : slugifyAgentName(name),
                      }));
                    }}
                    placeholder="ICT Silver Bullet Mentor"
                    className={inputClass}
                    maxLength={120}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-fg text-[11px] font-semibold">
                    Handle <span className="text-fg-subtle font-normal">@</span>
                  </span>
                  <input
                    value={form.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      patch({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') });
                    }}
                    placeholder="ict-mentor"
                    className={`${inputClass} font-mono`}
                    maxLength={32}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-fg text-[11px] font-semibold">One-line description</span>
                <input
                  value={form.description}
                  onChange={(event) => patch({ description: event.target.value })}
                  placeholder="Reads liquidity and explains Silver Bullet setups."
                  className={inputClass}
                  maxLength={1_000}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-fg text-[11px] font-semibold">
                  System instructions{' '}
                  <span className="text-fg-subtle font-normal">(required, ≥20 chars)</span>
                </span>
                <textarea
                  value={form.instructions}
                  onChange={(event) => patch({ instructions: event.target.value })}
                  rows={10}
                  placeholder={
                    'You are ...\n\n## Mandate\n...\n\n## Evidence checklist\n...\n\n## Output contract\n...'
                  }
                  className={`${inputClass} resize-y font-mono leading-relaxed`}
                  maxLength={24_000}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-fg text-[11px] font-semibold">Model</span>
                  <ModelSelect
                    value={form.model}
                    onChange={(value) => patch({ model: value })}
                    disabled={busy}
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-fg text-[11px] font-semibold">Import</span>
                  <input
                    ref={agentMdRef}
                    type="file"
                    accept=".md,text/markdown"
                    className="hidden"
                    onChange={(event) => {
                      void importAgentMd(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => agentMdRef.current?.click()}
                    disabled={busy}
                    className="border-border/60 text-fg-muted hover:text-fg inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold disabled:opacity-50"
                  >
                    <IconFileImport className="size-3.5" />
                    Import .agent.md
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-fg text-xs font-semibold">Your knowledge files</h3>
                  <span className="text-fg-subtle text-[10px]">{form.skills.length}/12</span>
                </div>
                {form.skills.length === 0 ? (
                  <p className="text-fg-subtle border-border/50 rounded-md border border-dashed p-3 text-[11px]">
                    No custom knowledge attached. Upload a Markdown/PDF file or paste a SKILL.md
                    below.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {form.skills.map((skill) => (
                      <li
                        key={skill.name}
                        className="border-border/60 bg-bg-elev-2/40 flex items-start justify-between gap-2 rounded-md border p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-fg font-mono text-[11px] font-semibold">
                            {skill.name}
                          </div>
                          <p className="text-fg-subtle line-clamp-2 text-[11px]">
                            {skill.description}
                          </p>
                          <p className="text-fg-subtle mt-0.5 text-[10px]">
                            {skill.instructions.length.toLocaleString()} chars
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${skill.name}`}
                          onClick={() =>
                            patch({
                              skills: form.skills.filter((item) => item.name !== skill.name),
                            })
                          }
                          className="text-fg-subtle hover:text-danger inline-flex size-7 shrink-0 items-center justify-center rounded-md"
                        >
                          <IconTrash className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="border-border/60 flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-fg text-xs font-semibold">Add a SKILL.md</h3>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".md,.txt,.pdf,text/markdown,application/pdf"
                      className="hidden"
                      onChange={(event) => {
                        void uploadSkill(event.currentTarget.files?.[0] ?? null);
                        event.currentTarget.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-[10px] font-semibold"
                    >
                      <IconUpload className="size-3" />
                      Upload
                    </button>
                  </div>
                </div>
                <input
                  value={skillName}
                  onChange={(event) => setSkillName(event.target.value)}
                  placeholder="Skill name (optional if frontmatter has one)"
                  className={`${inputClass} font-mono`}
                  maxLength={64}
                />
                <textarea
                  value={skillContent}
                  onChange={(event) => setSkillContent(event.target.value)}
                  rows={7}
                  placeholder={
                    '---\nname: my-playbook\ndescription: Use when ...\n---\n\n# Rules\n1. ...'
                  }
                  className={`${inputClass} resize-y font-mono leading-relaxed`}
                  maxLength={32_000}
                />
                {skillErrors.length > 0 ? (
                  <ul className="text-danger flex flex-col gap-1 text-[10px]">
                    {skillErrors.map((message) => (
                      <li key={message}>• {message}</li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => void addSkill()}
                  disabled={busy || !skillContent.trim()}
                  className="border-border/60 text-fg-muted hover:text-fg inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-md border px-3 text-[11px] font-semibold disabled:opacity-50"
                >
                  {busy ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconPlus className="size-3.5" />
                  )}
                  Validate &amp; add
                </button>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-fg text-xs font-semibold">Installed plugin playbooks</h3>
                {catalog.pluginSkills.length === 0 ? (
                  <p className="text-fg-subtle text-[11px]">
                    Install Backtesting, Paper Trading or Telegram to attach their playbooks.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {catalog.pluginSkills.map((skill) => {
                      const key = `${skill.pluginId}:${skill.name}`;
                      const checked = form.skillRefs.some(
                        (ref) => `${ref.pluginId}:${ref.skill}` === key,
                      );
                      return (
                        <li key={key}>
                          <label className="border-border/60 hover:bg-bg-elev-2/50 flex cursor-pointer items-start gap-2 rounded-md border p-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSkillRef(skill.pluginId, skill.name)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="text-fg block font-mono text-[11px] font-semibold">
                                {skill.name}
                              </span>
                              <span className="text-fg-subtle block text-[10px]">
                                {skill.pluginName}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-fg text-xs font-semibold">Allowed tools</h3>
                  <span className="text-fg-subtle text-[10px]">{form.tools.length} selected</span>
                </div>
                <input
                  value={toolQuery}
                  onChange={(event) => setToolQuery(event.target.value)}
                  placeholder="Search tools…"
                  className={inputClass}
                />
                <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
                  {groupedTools.map(([group, list]) => (
                    <div key={group} className="flex flex-col gap-1">
                      <h4 className="text-fg-subtle text-[10px] font-semibold tracking-wide uppercase">
                        {TOOL_GROUP_LABELS[group] ?? group}
                      </h4>
                      {list.map((tool) => {
                        const isWrite = tool.access === 'write';
                        const disabled =
                          isWrite &&
                          !catalog.settings.allowWriteTools &&
                          !form.tools.includes(tool.name);
                        return (
                          <label
                            key={tool.name}
                            className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 ${
                              form.tools.includes(tool.name)
                                ? 'border-brand/40 bg-brand/5'
                                : 'border-border/50 hover:bg-bg-elev-2/40'
                            } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={form.tools.includes(tool.name)}
                              disabled={disabled}
                              onChange={() => toggleTool(tool.name)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="text-fg flex items-center gap-1.5 font-mono text-[11px] font-semibold">
                                {tool.name}
                                {isWrite ? (
                                  <span className="border-warn/30 bg-warn/10 text-warn rounded border px-1 text-[9px] font-semibold uppercase">
                                    write
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-fg-subtle line-clamp-2 block text-[10px]">
                                {tool.description}
                              </span>
                              {disabled ? (
                                <span className="text-warn block text-[10px]">
                                  Enable “Allow write tools” in plugin settings to attach this.
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  {groupedTools.length === 0 ? (
                    <p className="text-fg-subtle text-[11px]">No tools match that search.</p>
                  ) : null}
                </div>
              </section>

              <label className="border-border/60 flex items-start gap-2 rounded-md border p-2.5">
                <input
                  type="checkbox"
                  checked={form.delegatable}
                  onChange={(event) => patch({ delegatable: event.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-fg block text-[11px] font-semibold">
                    Allow Kestrel Main Chat to delegate to this agent
                  </span>
                  <span className="text-fg-subtle block text-[10px]">
                    Delegated runs are read-only and never use MCP connections.
                  </span>
                </span>
              </label>

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-fg text-xs font-semibold">MCP servers</h3>
                  <button
                    type="button"
                    onClick={addMcpRow}
                    disabled={
                      !catalog.settings.allowMcp ||
                      form.mcpServers.length >= catalog.settings.maxMcpServers
                    }
                    className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-[10px] font-semibold disabled:opacity-40"
                  >
                    <IconPlus className="size-3" />
                    Add server
                  </button>
                </div>
                {!catalog.settings.allowMcp ? (
                  <p className="text-fg-subtle text-[11px]">
                    Remote MCP is disabled in Custom Agents settings.
                  </p>
                ) : form.mcpServers.length === 0 ? (
                  <p className="text-fg-subtle text-[11px]">
                    No MCP servers. HTTPS only; private hosts are blocked unless the operator allows
                    them.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {form.mcpServers.map((row, index) => (
                      <li
                        key={index}
                        className="border-border/60 flex flex-col gap-1.5 rounded-md border p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            value={row.id}
                            onChange={(event) =>
                              updateMcpRow(index, {
                                id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                              })
                            }
                            placeholder="server-id"
                            className={`${inputClass} max-w-40 font-mono`}
                            maxLength={32}
                          />
                          <button
                            type="button"
                            aria-label="Remove MCP server"
                            onClick={() =>
                              patch({ mcpServers: form.mcpServers.filter((_, i) => i !== index) })
                            }
                            className="text-fg-subtle hover:text-danger ml-auto inline-flex size-7 items-center justify-center rounded-md"
                          >
                            <IconTrash className="size-3.5" />
                          </button>
                        </div>
                        <input
                          value={row.url}
                          onChange={(event) => updateMcpRow(index, { url: event.target.value })}
                          placeholder="https://mcp.example.com/mcp"
                          className={`${inputClass} font-mono`}
                          maxLength={2_000}
                        />
                        <input
                          value={row.authorization}
                          onChange={(event) =>
                            updateMcpRow(index, { authorization: event.target.value })
                          }
                          placeholder={
                            row.hadAuthorization
                              ? 'Token stored — leave blank to keep'
                              : 'Authorization header (optional)'
                          }
                          className={`${inputClass} font-mono`}
                          maxLength={4_000}
                          type="password"
                        />
                        {row.hadAuthorization ? (
                          <label className="text-fg-subtle flex items-center gap-1.5 text-[10px]">
                            <input
                              type="checkbox"
                              checked={row.removeAuthorization}
                              onChange={(event) =>
                                updateMcpRow(index, { removeAuthorization: event.target.checked })
                              }
                            />
                            Remove the stored token
                          </label>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <footer className="border-border/60 flex items-center justify-between gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            disabled={busy}
            className="text-fg-muted hover:text-fg inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold disabled:opacity-50"
          >
            <IconChevronLeft className="size-3.5" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex items-center gap-2">
            {step < 2 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={busy}
                className="bg-fg inline-flex h-8 items-center gap-1 rounded-md px-3 text-[11px] font-semibold text-black disabled:opacity-50"
              >
                Next
                <IconChevronRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="bg-fg inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold text-black disabled:opacity-50"
              >
                {busy ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
                {agent ? 'Save changes' : 'Create agent'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
