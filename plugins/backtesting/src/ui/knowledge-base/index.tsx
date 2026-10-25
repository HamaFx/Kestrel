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

// Knowledge base panel.
//
// This barrel keeps the previous `./knowledge-base` import path working; state
// and API actions live in `use-knowledge-base.ts`, the editor and the document
// list are separate components.
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';

import { DocumentEditor } from './document-editor';
import { DocumentList } from './document-list';
import type { DocumentSummary } from './types';
import { useKnowledgeBase } from './use-knowledge-base';

export function KnowledgeBase({
  documents,
  onChanged,
}: {
  documents: readonly DocumentSummary[];
  onChanged: () => void;
}) {
  const form = useKnowledgeBase({ onChanged });

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
          onClick={form.toggleCreating}
          className="border-border/60 text-fg-muted hover:text-fg inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold"
        >
          <IconPlus className="size-3.5" />
          {form.creating ? 'Close' : 'Add document'}
        </button>
      </div>

      {form.error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{form.error}</span>
        </div>
      ) : null}

      {form.creating ? <DocumentEditor form={form} /> : null}

      <DocumentList documents={documents} form={form} />
    </div>
  );
}
