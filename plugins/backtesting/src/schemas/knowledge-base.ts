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

// Tool/API schemas for the user knowledge base (plugin_storage backed).

import { z } from 'zod';

export const KnowledgeKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Use a kebab-case key (a-z, 0-9, -).');

export const KnowledgeListInputSchema = z.object({});

export const KnowledgeDocumentSummarySchema = z.object({
  key: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string(),
  chars: z.number().int(),
});

export const KnowledgeListOutputSchema = z.object({
  documents: z.array(KnowledgeDocumentSummarySchema),
});

export type KnowledgeDocumentSummary = z.infer<typeof KnowledgeDocumentSummarySchema>;

export const KnowledgeReadInputSchema = z.object({
  key: KnowledgeKeySchema,
});

export const KnowledgeReadOutputSchema = z.object({
  key: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string(),
});

export type KnowledgeReadOutput = z.infer<typeof KnowledgeReadOutputSchema>;

export const KnowledgeSaveInputSchema = z.object({
  key: KnowledgeKeySchema.optional(),
  title: z.string().min(1).max(160),
  content: z.string().min(20).max(60_000),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
});

export type KnowledgeSaveInput = z.infer<typeof KnowledgeSaveInputSchema>;

export const KnowledgeSaveOutputSchema = z.object({
  ok: z.boolean(),
  key: z.string(),
  title: z.string(),
  message: z.string(),
});

export const KnowledgeDeleteInputSchema = z.object({
  key: KnowledgeKeySchema,
});
