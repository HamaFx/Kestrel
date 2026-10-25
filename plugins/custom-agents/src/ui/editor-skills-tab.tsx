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
import { IconLoader2, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react';

import { inputClass } from './editor-types';
import type { AgentEditorController } from './use-agent-editor';

export function EditorSkillsTab({ editor }: { editor: AgentEditorController }) {
  const {
    catalog,
    form,
    patch,
    busy,
    skillContent,
    setSkillContent,
    skillName,
    setSkillName,
    skillErrors,
    fileRef,
    addSkill,
    uploadSkill,
    toggleSkillRef,
  } = editor;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-fg text-xs font-semibold">Your knowledge files</h3>
          <span className="text-fg-subtle text-[10px]">{form.skills.length}/12</span>
        </div>
        {form.skills.length === 0 ? (
          <p className="text-fg-subtle border-border/50 rounded-md border border-dashed p-3 text-[11px]">
            No custom knowledge attached. Upload a Markdown/PDF file or paste a SKILL.md below.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {form.skills.map((skill) => (
              <li
                key={skill.name}
                className="border-border/60 bg-bg-elev-2/40 flex items-start justify-between gap-2 rounded-md border p-2.5"
              >
                <div className="min-w-0">
                  <div className="text-fg font-mono text-[11px] font-semibold">{skill.name}</div>
                  <p className="text-fg-subtle line-clamp-2 text-[11px]">{skill.description}</p>
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
          placeholder={'---\nname: my-playbook\ndescription: Use when ...\n---\n\n# Rules\n1. ...'}
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
              const checked = form.skillRefs.some((ref) => `${ref.pluginId}:${ref.skill}` === key);
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
                      <span className="text-fg-subtle block text-[10px]">{skill.pluginName}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
