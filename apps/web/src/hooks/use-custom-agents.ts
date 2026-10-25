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
 * Load the user's custom agents for the chat composer.
 *
 * The plugin API 404s when Custom Agents is not installed; that is a normal
 * "no agents" state, not an error worth showing in chat.
 */
export function useCustomAgents(): {
  agents: CustomAgentSummary[];
  loading: boolean;
} {
  const [agents, setAgents] = useState<CustomAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/plugins/custom-agents/agents', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
      .then(async (response) => {
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
  }, []);

  return { agents, loading };
}
