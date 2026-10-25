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
import type { PluginToolPartProps } from '@kestrel/plugin-sdk/ui';
import { IconArrowUpRight, IconCheck, IconLoader2, IconUsersGroup } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import {
  CreateAgentOutputSchema,
  DeleteAgentOutputSchema,
  GetAgentOutputSchema,
  ListAgentsOutputSchema,
} from '../schemas';

function Loading({ label }: { label: string }) {
  return (
    <div className="surface-panel flex items-center gap-2 rounded-xl border border-white/10 p-3 text-xs">
      <IconLoader2 className="text-brand size-3.5 animate-spin" />
      <span className="text-fg-muted">{label}</span>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="border-danger/30 bg-danger/5 text-danger rounded-xl border p-3 text-xs">
      {message}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconUsersGroup className="text-brand size-4" />
          <h3 className="text-fg text-sm font-semibold">Custom agents</h3>
        </div>
        <a
          href="/plugins/custom-agents"
          className="text-brand inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
        >
          Agent Studio
          <IconArrowUpRight className="size-3" />
        </a>
      </header>
      {children}
    </section>
  );
}

export function CustomAgentsListCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') return <Loading label="Loading agents…" />;
  if (state === 'error') return <ErrorCard message={errorMessage ?? 'Could not load agents.'} />;
  const parsed = ListAgentsOutputSchema.safeParse(output);
  if (!parsed.success) return <ErrorCard message="Unexpected agent list shape." />;
  if (parsed.data.agents.length === 0) {
    return (
      <Shell>
        <p className="text-fg-subtle text-[11px]">No custom agents yet.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <ul className="flex flex-col gap-1">
        {parsed.data.agents.map((agent) => (
          <li
            key={agent.id}
            className="border-border/50 bg-bg-elev-2/40 flex items-start justify-between gap-2 rounded-md border p-2"
          >
            <div className="min-w-0">
              <div className="text-fg truncate text-[11px] font-semibold">{agent.name}</div>
              <div className="text-fg-subtle font-mono text-[10px]">@{agent.slug}</div>
              <div className="text-fg-subtle line-clamp-1 text-[10px]">{agent.description}</div>
            </div>
            <span className="text-fg-subtle shrink-0 font-mono text-[10px]">
              {agent.tools.length} tools
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

export function CustomAgentCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') return <Loading label="Loading agent…" />;
  if (state === 'error') return <ErrorCard message={errorMessage ?? 'Could not load the agent.'} />;
  const parsed = GetAgentOutputSchema.safeParse(output);
  if (!parsed.success) return <ErrorCard message="Unexpected agent shape." />;
  const agent = parsed.data.agent;
  return (
    <Shell>
      <div>
        <div className="text-fg text-xs font-semibold">{agent.name}</div>
        <div className="text-fg-subtle font-mono text-[10px]">@{agent.slug}</div>
      </div>
      <p className="text-fg-muted text-[11px] whitespace-pre-wrap">{agent.instructions}</p>
      <div className="text-fg-subtle flex flex-wrap gap-1">
        {agent.tools.map((tool) => (
          <span key={tool} className="bg-bg-elev-2 rounded px-1.5 py-0.5 font-mono text-[9px]">
            {tool}
          </span>
        ))}
      </div>
    </Shell>
  );
}

export function CustomAgentSavedCard({ output, state, errorMessage }: PluginToolPartProps) {
  if (state === 'loading') return <Loading label="Saving agent…" />;
  if (state === 'error') return <ErrorCard message={errorMessage ?? 'Could not save the agent.'} />;
  const created = CreateAgentOutputSchema.safeParse(output);
  const deleted = DeleteAgentOutputSchema.safeParse(output);
  if (deleted.success) {
    return (
      <Shell>
        <p className="text-fg-muted text-[11px]">{deleted.data.message}</p>
      </Shell>
    );
  }
  if (!created.success) return <ErrorCard message="Unexpected agent result shape." />;
  const agent = created.data.agent;
  return (
    <Shell>
      <div className="flex items-start gap-2">
        <IconCheck className="text-bull mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <div className="text-fg text-xs font-semibold">{created.data.message}</div>
          <div className="text-fg-subtle font-mono text-[10px]">@{agent.slug}</div>
          <p className="text-fg-muted mt-1 line-clamp-2 text-[11px]">{agent.description}</p>
          <p className="text-fg-subtle mt-1 text-[10px]">
            Type <code className="font-mono">@{agent.slug} …</code> in the composer to use it.
          </p>
        </div>
      </div>
    </Shell>
  );
}
