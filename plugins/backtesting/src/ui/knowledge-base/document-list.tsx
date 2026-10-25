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

// Document list with inline read/delete actions and an expanded preview.
import {
  IconBook,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconTrash,
} from '@tabler/icons-react';

import { fmtDate } from '../format';
import type { DocumentSummary } from './types';
import type { KnowledgeBaseController } from './use-knowledge-base';

export function DocumentList({
  documents,
  form,
}: {
  documents: readonly DocumentSummary[];
  form: KnowledgeBaseController;
}) {
  if (documents.length === 0) {
    return (
      <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-8 text-center text-xs">
        No documents yet. Add your own rules so Kestrel can backtest them exactly.
      </div>
    );
  }

  return (
    <ul className="divide-border/40 border-border/50 divide-y rounded-xl border">
      {documents.map((entry) => (
        <li key={entry.key} className="flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => void form.read(entry.key)}
              className="text-fg-muted hover:text-fg inline-flex size-6 shrink-0 items-center justify-center"
              aria-label={form.expanded === entry.key ? 'Collapse' : 'Read document'}
            >
              {form.busy === entry.key ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : form.expanded === entry.key ? (
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
                onClick={() => void form.remove(entry.key)}
                disabled={form.busy !== null}
                className="text-fg-subtle hover:text-danger ml-1 inline-flex size-7 items-center justify-center rounded-md disabled:opacity-40"
                aria-label={`Delete ${entry.title}`}
              >
                <IconTrash className="size-3.5" />
              </button>
            </div>
          </div>
          {form.expanded === entry.key && form.document ? (
            <pre className="border-border/40 bg-bg-elev-1/50 text-fg-muted max-h-80 overflow-auto border-t p-3 font-mono text-[11px] whitespace-pre-wrap">
              {form.document.content}
            </pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
