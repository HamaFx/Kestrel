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

// Reducer state for the knowledge base panel.

import type { z } from 'zod';

import type { KnowledgeReadOutputSchema } from '../../schemas';

type DocumentContent = z.infer<typeof KnowledgeReadOutputSchema>;

export interface KnowledgeBaseState {
  expanded: string | null;
  document: DocumentContent | null;
  busy: string | null;
  error: string | null;
  creating: boolean;
  title: string;
  key: string;
  tags: string;
  content: string;
}

export type KnowledgeBaseAction =
  { type: 'patch'; patch: Partial<KnowledgeBaseState> } | { type: 'toggleCreating' };

export function createInitialState(): KnowledgeBaseState {
  return {
    expanded: null,
    document: null,
    busy: null,
    error: null,
    creating: false,
    title: '',
    key: '',
    tags: '',
    content: '',
  };
}

export function reducer(
  state: KnowledgeBaseState,
  action: KnowledgeBaseAction,
): KnowledgeBaseState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'toggleCreating':
      return { ...state, creating: !state.creating };
  }
}
