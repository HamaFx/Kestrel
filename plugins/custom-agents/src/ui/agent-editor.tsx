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

// Three-step custom-agent editor shell. Form state lives in
// `use-agent-editor.ts`; each step is a focused presentational tab.
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconLoader2,
  IconX,
} from '@tabler/icons-react';
import { useEffect } from 'react';

import type { AgentView, CatalogOutput } from '../schemas';
import { EditorGeneralTab } from './editor-general-tab';
import { EditorSkillsTab } from './editor-skills-tab';
import { EditorToolsMcpTab } from './editor-tools-mcp-tab';
import { useAgentEditor } from './use-agent-editor';

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
  const editor = useAgentEditor({ open, agent, catalog, onClose, onSaved });
  const { step, setStep, busy, error, save } = editor;

  // Escape closes the editor unless a save/upload is in flight.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

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

          {step === 0 ? <EditorGeneralTab editor={editor} /> : null}
          {step === 1 ? <EditorSkillsTab editor={editor} /> : null}
          {step === 2 ? <EditorToolsMcpTab editor={editor} /> : null}
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
                className="bg-brand inline-flex h-9 items-center gap-1 rounded-md px-3.5 text-[11px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
              >
                Next
                <IconChevronRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="bg-brand inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[11px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
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
