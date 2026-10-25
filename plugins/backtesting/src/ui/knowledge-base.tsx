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
  IconBook,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { z } from 'zod';

import type { KnowledgeDocumentSummarySchema, KnowledgeReadOutputSchema } from '../schemas';
import { errorMessage, pluginFetch } from './api';
import { fmtDate } from './format';

type DocumentSummary = z.infer<typeof KnowledgeDocumentSummarySchema>;
type DocumentContent = z.infer<typeof KnowledgeReadOutputSchema>;

const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-9 rounded-md border px-2.5 text-xs outline-none';

export function KnowledgeBase({
  documents,
  onChanged,
}: {
  documents: readonly DocumentSummary[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentContent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');

  async function read(keyToRead: string) {
    if (expanded === keyToRead) {
      setExpanded(null);
      setDocument(null);
      return;
    }
    setBusy(keyToRead);
    setError(null);
    try {
      const response = await pluginFetch<{ document: DocumentContent }>(
        `/knowledge/${encodeURIComponent(keyToRead)}`,
      );
      setDocument(response.document);
      setExpanded(keyToRead);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(keyToDelete: string) {
    setBusy(keyToDelete);
    setError(null);
    try {
      await pluginFetch(`/knowledge/${encodeURIComponent(keyToDelete)}`, {
        method: 'DELETE',
      });
      if (expanded === keyToDelete) {
        setExpanded(null);
        setDocument(null);
      }
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy('save');
    setError(null);
    try {
      await pluginFetch('/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          title,
          ...(key.trim() ? { key: key.trim() } : {}),
          content,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      setTitle('');
      setKey('');
      setTags('');
      setContent('');
      setCreating(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-fg text-sm font-semibold">Knowledge base</h2>
          <p className="text-fg-subtle text-[11px]">
            Your own playbooks. Agents read these before designing a strategy when you reference
            them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="border-border/60 text-fg-muted hover:text-fg inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold"
        >
          <IconPlus className="size-3.5" />
          {creating ? 'Close' : 'Add document'}
        </button>
      </div>

      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {creating ? (
        <form
          onSubmit={save}
          className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-3"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title (e.g. My London sweep rules)"
              required
              className={inputClass}
            />
            <input
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Key (optional, kebab-case)"
              pattern="[a-z0-9][a-z0-9-]{0,63}"
              className={inputClass}
            />
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="Tags, comma separated"
              className={inputClass}
            />
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Markdown playbook, rules, entry/exit conditions…"
            rows={7}
            required
            minLength={20}
            className="border-border/60 bg-bg-elev-1 text-fg focus:border-brand/60 rounded-md border p-3 font-mono text-[11px] leading-relaxed outline-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy !== null || title.trim().length === 0 || content.trim().length < 20}
              className="bg-brand inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'save' ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
              Save document
            </button>
          </div>
        </form>
      ) : null}

      {documents.length === 0 ? (
        <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-8 text-center text-xs">
          No documents yet. Add your own rules so Kestrel can backtest them exactly.
        </div>
      ) : (
        <ul className="divide-border/40 border-border/50 divide-y rounded-xl border">
          {documents.map((entry) => (
            <li key={entry.key} className="flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void read(entry.key)}
                  className="text-fg-muted hover:text-fg inline-flex size-6 shrink-0 items-center justify-center"
                  aria-label={expanded === entry.key ? 'Collapse' : 'Read document'}
                >
                  {busy === entry.key ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : expanded === entry.key ? (
                    <IconChevronDown className="size-3.5" />
                  ) : (
                    <IconChevronRight className="size-3.5" />
                  )}
                </button>
                <IconBook className="text-fg-subtle size-3.5 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-fg truncate text-xs font-semibold">{entry.title}</span>
                  <span className="text-fg-subtle font-mono text-[10px]">
                    {entry.key} · {entry.chars} chars · {fmtDate(entry.updatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-bg-elev-2 text-fg-subtle rounded px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {tag}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => void remove(entry.key)}
                    disabled={busy !== null}
                    className="text-fg-subtle hover:text-danger ml-1 inline-flex size-7 items-center justify-center rounded-md disabled:opacity-40"
                    aria-label={`Delete ${entry.title}`}
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </div>
              </div>
              {expanded === entry.key && document ? (
                <pre className="border-border/40 bg-bg-elev-1/50 text-fg-muted max-h-80 overflow-auto border-t p-3 font-mono text-[11px] whitespace-pre-wrap">
                  {document.content}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
