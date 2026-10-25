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
  IconBolt,
  IconBrain,
  IconEdit,
  IconHistory,
  IconLoader2,
  IconMessages,
  IconPlugConnected,
  IconTrash,
  IconUserShield,
} from '@tabler/icons-react';

import type { AgentView } from '../schemas';
import { fmtDate } from './api';

export function AgentCard({
  agent,
  busy,
  onEdit,
  onDelete,
  onChat,
  onRuns,
}: {
  agent: AgentView;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChat: () => void;
  onRuns: () => void;
}) {
  const initials = agent.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <article className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-3.5">
      <header className="flex items-start gap-3">
        <div
          className="bg-brand/10 text-brand border-brand/20 flex size-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold"
          aria-hidden="true"
        >
          {initials || '@'}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-fg truncate text-sm font-semibold">{agent.name}</h3>
          <p className="text-fg-subtle font-mono text-[11px]">@{agent.slug}</p>
        </div>
        {agent.delegatable ? (
          <span
            className="border-brand/30 bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            title="Kestrel Main Chat may delegate to this agent"
          >
            <IconBolt className="size-3" />
            Delegatable
          </span>
        ) : null}
      </header>

      <p className="text-fg-muted line-clamp-2 min-h-[2.4em] text-[11px]">
        {agent.description || 'No description yet.'}
      </p>

      <div className="text-fg-subtle flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <span className="inline-flex items-center gap-1">
          <IconBrain className="size-3" />
          {agent.model ?? 'Chat model'}
        </span>
        <span className="inline-flex items-center gap-1">
          <IconPlugConnected className="size-3" />
          {agent.tools.length} tools
        </span>
        <span className="inline-flex items-center gap-1">
          <IconUserShield className="size-3" />
          {agent.skills.length + agent.skillRefs.length} skills
        </span>
        {agent.mcpServers.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            <IconPlugConnected className="size-3" />
            {agent.mcpServers.length} MCP
          </span>
        ) : null}
        <span>
          {agent.runCount} run{agent.runCount === 1 ? '' : 's'} · {fmtDate(agent.lastUsedAt)}
        </span>
      </div>

      <footer className="mt-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onChat}
          className="bg-brand/10 text-brand border-brand/30 hover:bg-brand/20 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors"
        >
          <IconMessages className="size-3.5" />
          Chat
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="border-border/60 text-fg-muted hover:text-fg inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors"
        >
          <IconEdit className="size-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onRuns}
          className="text-fg-subtle hover:text-fg inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors"
          title="View recent runs"
        >
          <IconHistory className="size-3.5" />
          Runs
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${agent.name}`}
          className="text-fg-subtle hover:text-danger ml-auto inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40"
        >
          {busy ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconTrash className="size-3.5" />
          )}
        </button>
      </footer>
    </article>
  );
}
