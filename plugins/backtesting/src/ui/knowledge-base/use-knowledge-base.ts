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

// Knowledge base state and API actions.
import { useReducer } from 'react';

import { errorMessage, pluginFetch } from '../api';
import { createInitialState, reducer, type KnowledgeBaseState } from './state';
import type { DocumentContent } from './types';

export type KnowledgeBaseController = ReturnType<typeof useKnowledgeBase>;

export function useKnowledgeBase({ onChanged }: { onChanged: () => void }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const patch = (next: Partial<KnowledgeBaseState>) => dispatch({ type: 'patch', patch: next });

  async function read(keyToRead: string) {
    if (state.expanded === keyToRead) {
      patch({ expanded: null, document: null });
      return;
    }
    patch({ busy: keyToRead, error: null });
    try {
      const response = await pluginFetch<{ document: DocumentContent }>(
        `/knowledge/${encodeURIComponent(keyToRead)}`,
      );
      patch({ document: response.document, expanded: keyToRead });
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: null });
    }
  }

  async function remove(keyToDelete: string) {
    patch({ busy: keyToDelete, error: null });
    try {
      await pluginFetch(`/knowledge/${encodeURIComponent(keyToDelete)}`, {
        method: 'DELETE',
      });
      if (state.expanded === keyToDelete) {
        patch({ expanded: null, document: null });
      }
      onChanged();
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: null });
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    patch({ busy: 'save', error: null });
    try {
      await pluginFetch('/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          title: state.title,
          ...(state.key.trim() ? { key: state.key.trim() } : {}),
          content: state.content,
          tags: state.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      patch({ title: '', key: '', tags: '', content: '', creating: false });
      onChanged();
    } catch (err) {
      patch({ error: errorMessage(err) });
    } finally {
      patch({ busy: null });
    }
  }

  return {
    ...state,
    read,
    remove,
    save,
    setTitle: (value: string) => patch({ title: value }),
    setKey: (value: string) => patch({ key: value }),
    setTags: (value: string) => patch({ tags: value }),
    setContent: (value: string) => patch({ content: value }),
    toggleCreating: () => dispatch({ type: 'toggleCreating' }),
  };
}
