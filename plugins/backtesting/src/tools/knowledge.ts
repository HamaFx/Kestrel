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

// Private knowledge-base tools.

import type { PluginToolRegistration } from '@kestrel/plugin-sdk';
import type { z } from 'zod';

import { deleteKnowledge, listKnowledge, readKnowledge, saveKnowledge } from '../knowledge';
import {
  KnowledgeDeleteInputSchema,
  KnowledgeListInputSchema,
  KnowledgeListOutputSchema,
  KnowledgeReadInputSchema,
  KnowledgeReadOutputSchema,
  KnowledgeSaveInputSchema,
  KnowledgeSaveOutputSchema,
  OkOutputSchema,
} from '../schemas';

const listKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeListInputSchema>,
  z.infer<typeof KnowledgeListOutputSchema>
> = {
  name: 'backtest_knowledge_list',
  description:
    'List the user’s private strategy knowledge documents (their own playbooks, notes, and research). Check this before designing a strategy that should follow the user’s own rules.',
  inputSchema: KnowledgeListInputSchema,
  outputSchema: KnowledgeListOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (_input, ctx) => ({ documents: await listKnowledge(ctx) }),
};

const readKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeReadInputSchema>,
  z.infer<typeof KnowledgeReadOutputSchema>
> = {
  name: 'backtest_knowledge_read',
  description:
    'Read one private strategy knowledge document by key. Use it when the user references their own playbook or when you need their exact entry/exit rules.',
  inputSchema: KnowledgeReadInputSchema,
  outputSchema: KnowledgeReadOutputSchema,
  access: 'read-only',
  attachTo: ['canonical-chat', 'technical', 'fundamental', 'risk', 'sentiment'],
  execute: async (input, ctx) => {
    const document = await readKnowledge(ctx, input.key);
    if (!document) throw new Error(`Knowledge document "${input.key}" was not found.`);
    return document;
  },
};

const saveKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeSaveInputSchema>,
  z.infer<typeof KnowledgeSaveOutputSchema>
> = {
  name: 'backtest_knowledge_save',
  description:
    'Save or update a private strategy knowledge document (Markdown). Use this when the user dictates rules or asks you to remember a playbook for future backtests.',
  inputSchema: KnowledgeSaveInputSchema,
  outputSchema: KnowledgeSaveOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat', 'technical'],
  execute: async (input, ctx) => {
    const saved = await saveKnowledge(ctx, input);
    return {
      ok: true,
      key: saved.key,
      title: saved.title,
      message: `Saved "${saved.title}" as ${saved.key}.`,
    };
  },
};

const deleteKnowledgeTool: PluginToolRegistration<
  z.infer<typeof KnowledgeDeleteInputSchema>,
  z.infer<typeof OkOutputSchema>
> = {
  name: 'backtest_knowledge_delete',
  description: 'Delete one private strategy knowledge document by key.',
  inputSchema: KnowledgeDeleteInputSchema,
  outputSchema: OkOutputSchema,
  access: 'write',
  requiresConfirmation: false,
  attachTo: ['canonical-chat'],
  execute: async (input, ctx) => {
    const deleted = await deleteKnowledge(ctx, input.key);
    return {
      ok: deleted,
      message: deleted ? 'Knowledge document deleted.' : 'No such document was found.',
    };
  },
};

export const knowledgeTools: readonly PluginToolRegistration[] = [
  listKnowledgeTool,
  readKnowledgeTool,
  saveKnowledgeTool,
  deleteKnowledgeTool,
];
