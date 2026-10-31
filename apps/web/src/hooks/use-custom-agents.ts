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
import { useEffect, useState } from 'react';

export interface CustomAgentSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  model: string | null;
  delegatable: boolean;
  runCount: number;
}

interface AgentsResponse {
  agents: CustomAgentSummary[];
}

/**
 * Page-session memo for "custom-agents is not installed for this user".
 *
 * The plugin API 404s when Custom Agents is not installed; that is a normal
 * "no agents" state, not an error. Remembering it stops every chat-thread
 * navigation from re-firing the request (and its DevTools 404).
 */
let customAgentsPluginNotInstalled = false;

/**
 * Load the user's custom agents for the chat composer.
 *
 * Callers that already know the user's installed plugins should pass
 * `enabled: false` so the request is never sent at all.
 */
export function useCustomAgents(options: { enabled?: boolean } = {}): {
  agents: CustomAgentSummary[];
  loading: boolean;
} {
  const enabled = options.enabled ?? true;
  const [agents, setAgents] = useState<CustomAgentSummary[]>([]);
  const [loading, setLoading] = useState(enabled && !customAgentsPluginNotInstalled);

  useEffect(() => {
    if (!enabled || customAgentsPluginNotInstalled) {
      setAgents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch('/api/plugins/custom-agents/agents', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
      .then(async (response) => {
        if (response.status === 404) {
          // Not installed or disabled for this user — treat as no agents and
          // remember it for the rest of the page session.
          customAgentsPluginNotInstalled = true;
          return { agents: [] } as AgentsResponse;
        }
        if (!response.ok) return { agents: [] } as AgentsResponse;
        return (await response.json()) as AgentsResponse;
      })
      .then((data) => {
        if (!cancelled) setAgents(Array.isArray(data.agents) ? data.agents : []);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { agents, loading };
}
