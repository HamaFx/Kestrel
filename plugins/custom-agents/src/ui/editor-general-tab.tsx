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
import { IconFileImport } from '@tabler/icons-react';

import { slugifyAgentName } from '../slugs';
import { inputClass } from './editor-types';
import { ModelSelect } from './model-select';
import type { AgentEditorController } from './use-agent-editor';

export function EditorGeneralTab({ editor }: { editor: AgentEditorController }) {
  const { form, setForm, slugTouched, setSlugTouched, patch, busy, agentMdRef, importAgentMd } =
    editor;

  return (
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
  );
}
