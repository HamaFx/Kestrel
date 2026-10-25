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
import type { PluginDashboardWidgetProps } from '@kestrel/plugin-sdk/ui';
import { IconArrowUpRight, IconLoader2, IconUsersGroup } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import type { AgentView } from '../schemas';
import { pluginFetch } from './api';

export function CustomAgentsWidget(_props: PluginDashboardWidgetProps) {
  const [agents, setAgents] = useState<AgentView[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pluginFetch<{ agents: AgentView[] }>('/agents')
      .then((data) => {
        if (!cancelled) setAgents(data.agents);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="text-fg-subtle text-[11px]">
        Custom agents are installed but the Studio API is unavailable.
      </div>
    );
  }
  if (!agents) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <IconLoader2 className="text-brand size-3.5 animate-spin" />
        <span className="text-fg-subtle">Loading agents…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconUsersGroup className="text-brand size-4" />
          <span className="text-fg text-xs font-semibold">{agents.length} custom agents</span>
        </div>
        <a
          href="/plugins/custom-agents"
          className="text-brand inline-flex items-center gap-1 text-[10px] font-semibold hover:underline"
        >
          Studio
          <IconArrowUpRight className="size-3" />
        </a>
      </div>
      {agents.length === 0 ? (
        <p className="text-fg-subtle text-[10px]">No agents yet — add the ICT mentor blueprint.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {agents.slice(0, 4).map((agent) => (
            <li key={agent.id} className="flex items-center justify-between gap-2">
              <span className="text-fg-muted truncate font-mono text-[10px]">@{agent.slug}</span>
              <span className="text-fg-subtle shrink-0 text-[10px]">
                {agent.delegatable ? 'delegatable' : `${agent.tools.length} tools`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
