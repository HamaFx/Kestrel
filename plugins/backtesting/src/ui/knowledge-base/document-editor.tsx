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

// New-document editor form.
import { IconLoader2 } from '@tabler/icons-react';

import type { KnowledgeBaseController } from './use-knowledge-base';

const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-9 rounded-md border px-2.5 text-xs outline-none';

export function DocumentEditor({ form }: { form: KnowledgeBaseController }) {
  return (
    <form
      onSubmit={form.save}
      className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={form.title}
          onChange={(event) => form.setTitle(event.target.value)}
          placeholder="Title (e.g. My London sweep rules)"
          required
          className={inputClass}
        />
        <input
          value={form.key}
          onChange={(event) => form.setKey(event.target.value)}
          placeholder="Key (optional, kebab-case)"
          pattern="[a-z0-9][a-z0-9-]{0,63}"
          className={inputClass}
        />
        <input
          value={form.tags}
          onChange={(event) => form.setTags(event.target.value)}
          placeholder="Tags, comma separated"
          className={inputClass}
        />
      </div>
      <textarea
        value={form.content}
        onChange={(event) => form.setContent(event.target.value)}
        placeholder="Markdown playbook, rules, entry/exit conditions…"
        rows={7}
        required
        minLength={20}
        className="border-border/60 bg-bg-elev-1 text-fg focus:border-brand/60 rounded-md border p-3 font-mono text-[11px] leading-relaxed outline-none"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={
            form.busy !== null || form.title.trim().length === 0 || form.content.trim().length < 20
          }
          className="bg-brand inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {form.busy === 'save' ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
          Save document
        </button>
      </div>
    </form>
  );
}
