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
import type { PluginPageProps } from '@kestrel/plugin-sdk/ui';
import {
  IconAlertTriangle,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AgentView, CatalogOutput } from '../schemas';
import { AgentCard } from './agent-card';
import { AgentEditor } from './agent-editor';
import { AgentRunsDialog } from './agent-runs-dialog';
import { errorMessage, pluginFetch } from './api';
import { TemplateGallery } from './template-gallery';

export function AgentStudioPage(_props: PluginPageProps) {
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [catalog, setCatalog] = useState<CatalogOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AgentView | null>(null);
  const [runsAgent, setRunsAgent] = useState<AgentView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, cat] = await Promise.all([
        pluginFetch<{ agents: AgentView[]; count: number }>('/agents'),
        pluginFetch<CatalogOutput>('/catalog'),
      ]);
      setAgents(list.agents);
      setCatalog(cat);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const existingSlugs = useMemo(() => new Set(agents.map((agent) => agent.slug)), [agents]);

  const addTemplate = useCallback(
    async (templateId: string) => {
      setBusyId(templateId);
      setError(null);
      try {
        await pluginFetch(`/templates/${encodeURIComponent(templateId)}`, { method: 'POST' });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const deleteAgent = useCallback(
    async (agent: AgentView) => {
      if (
        !window.confirm(`Delete @${agent.slug}? Its instructions and knowledge will be removed.`)
      ) {
        return;
      }
      setBusyId(agent.id);
      setError(null);
      try {
        await pluginFetch(`/agents/${encodeURIComponent(agent.id)}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  function chatWith(agent: AgentView) {
    window.location.assign(`/chat?new=1&agent=${encodeURIComponent(agent.slug)}`);
  }

  if (loading && !catalog) {
    return (
      <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-6 text-sm">
        <IconLoader2 className="text-brand size-4 animate-spin" />
        <span className="text-fg-muted">Loading Agent Studio…</span>
      </div>
    );
  }

  const delegatable = agents.filter((agent) => agent.delegatable).length;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      ) : null}

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconUsersGroup className="text-brand size-4" />
          <div>
            <h2 className="text-fg text-sm font-semibold">Your agents</h2>
            <p className="text-fg-subtle text-[11px]">
              {agents.length}
              {catalog ? `/${catalog.settings.maxAgents}` : ''} agents · {delegatable} delegatable
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-fg-subtle hover:text-fg inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold disabled:opacity-50"
          >
            {loading ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconRefresh className="size-3.5" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            className="bg-brand/10 text-brand border-brand/30 hover:bg-brand/20 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold"
          >
            <IconPlus className="size-3.5" />
            New agent
          </button>
        </div>
      </section>

      {catalog && agents.length === 0 ? (
        <TemplateGallery
          templates={catalog.templates}
          existingSlugs={existingSlugs}
          busyId={busyId}
          onAdd={(id) => void addTemplate(id)}
        />
      ) : null}

      {agents.length === 0 ? (
        <div className="border-border/50 text-fg-subtle rounded-xl border border-dashed p-8 text-center text-xs">
          No agents yet. Add a blueprint above or build one from scratch.
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              busy={busyId === agent.id}
              onEdit={() => {
                setEditing(agent);
                setEditorOpen(true);
              }}
              onDelete={() => void deleteAgent(agent)}
              onChat={() => chatWith(agent)}
              onRuns={() => setRunsAgent(agent)}
            />
          ))}
        </section>
      )}

      {catalog && agents.length > 0 ? (
        <TemplateGallery
          templates={catalog.templates.filter((template) => !existingSlugs.has(template.slug))}
          existingSlugs={existingSlugs}
          busyId={busyId}
          onAdd={(id) => void addTemplate(id)}
        />
      ) : null}

      {catalog ? (
        <AgentEditor
          open={editorOpen}
          agent={editing}
          catalog={catalog}
          onClose={() => setEditorOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}

      {runsAgent ? <AgentRunsDialog agent={runsAgent} onClose={() => setRunsAgent(null)} /> : null}

      <section className="text-fg-subtle border-border/40 rounded-lg border p-3 text-[10px] leading-relaxed">
        <strong className="text-fg-muted">How to use an agent:</strong> type{' '}
        <code className="font-mono">@handle your question</code> in chat, pick it in the composer
        agent selector, or use <code className="font-mono">/ask @handle …</code> in Telegram.
        Delegatable agents can also be called by Kestrel Main Chat when the task matches their
        description.
      </section>
    </div>
  );
}
