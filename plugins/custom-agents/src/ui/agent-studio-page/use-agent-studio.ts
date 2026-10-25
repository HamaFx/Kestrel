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

// State + actions for the Agent Studio page.
//
// The reducer keeps the agent list, catalog, editor and run-history dialogs in
// one place so the page shell stays a thin presentational component.

import { useCallback, useEffect, useReducer } from 'react';

import type { AgentView, CatalogOutput } from '../../schemas';
import { errorMessage, pluginFetch } from '../api';

interface AgentStudioState {
  agents: AgentView[];
  catalog: CatalogOutput | null;
  loading: boolean;
  error: string | null;
  busyId: string | null;
  editorOpen: boolean;
  editing: AgentView | null;
  runsAgent: AgentView | null;
}

type AgentStudioAction =
  | { type: 'load-start' }
  | { type: 'load-success'; agents: AgentView[]; catalog: CatalogOutput }
  | { type: 'load-error'; error: string }
  | { type: 'busy'; id: string }
  | { type: 'clear-busy' }
  | { type: 'set-error'; error: string }
  | { type: 'open-editor'; agent: AgentView | null }
  | { type: 'close-editor' }
  | { type: 'open-runs'; agent: AgentView }
  | { type: 'close-runs' };

const initialState: AgentStudioState = {
  agents: [],
  catalog: null,
  loading: true,
  error: null,
  busyId: null,
  editorOpen: false,
  editing: null,
  runsAgent: null,
};

function agentStudioReducer(state: AgentStudioState, action: AgentStudioAction): AgentStudioState {
  switch (action.type) {
    case 'load-start':
      return { ...state, loading: true, error: null };
    case 'load-success':
      return { ...state, agents: action.agents, catalog: action.catalog, loading: false };
    case 'load-error':
      return { ...state, error: action.error, loading: false };
    case 'busy':
      return { ...state, busyId: action.id, error: null };
    case 'clear-busy':
      return { ...state, busyId: null };
    case 'set-error':
      return { ...state, error: action.error };
    case 'open-editor':
      return { ...state, editing: action.agent, editorOpen: true };
    case 'close-editor':
      return { ...state, editorOpen: false };
    case 'open-runs':
      return { ...state, runsAgent: action.agent };
    case 'close-runs':
      return { ...state, runsAgent: null };
  }
}

export function useAgentStudio() {
  const [state, dispatch] = useReducer(agentStudioReducer, initialState);

  const load = useCallback(async () => {
    dispatch({ type: 'load-start' });
    try {
      const [list, cat] = await Promise.all([
        pluginFetch<{ agents: AgentView[]; count: number }>('/agents'),
        pluginFetch<CatalogOutput>('/catalog'),
      ]);
      dispatch({ type: 'load-success', agents: list.agents, catalog: cat });
    } catch (err) {
      dispatch({ type: 'load-error', error: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addTemplate = useCallback(
    async (templateId: string) => {
      dispatch({ type: 'busy', id: templateId });
      try {
        await pluginFetch(`/templates/${encodeURIComponent(templateId)}`, { method: 'POST' });
        await load();
      } catch (err) {
        dispatch({ type: 'set-error', error: errorMessage(err) });
      } finally {
        dispatch({ type: 'clear-busy' });
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
      dispatch({ type: 'busy', id: agent.id });
      try {
        await pluginFetch(`/agents/${encodeURIComponent(agent.id)}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        dispatch({ type: 'set-error', error: errorMessage(err) });
      } finally {
        dispatch({ type: 'clear-busy' });
      }
    },
    [load],
  );

  const openEditor = useCallback((agent: AgentView | null) => {
    dispatch({ type: 'open-editor', agent });
  }, []);

  const closeEditor = useCallback(() => dispatch({ type: 'close-editor' }), []);

  const openRuns = useCallback((agent: AgentView) => dispatch({ type: 'open-runs', agent }), []);

  const closeRuns = useCallback(() => dispatch({ type: 'close-runs' }), []);

  const chatWith = useCallback((agent: AgentView) => {
    window.location.assign(`/chat?new=1&agent=${encodeURIComponent(agent.slug)}`);
  }, []);

  return {
    ...state,
    load,
    addTemplate,
    deleteAgent,
    openEditor,
    closeEditor,
    openRuns,
    closeRuns,
    chatWith,
  };
}
