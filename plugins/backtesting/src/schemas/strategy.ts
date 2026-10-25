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

// Tool/API schemas for the Backtesting Lab — saved strategy library.

import { z } from 'zod';

import { MAX_SOURCE_CHARS, StrategyParamsSchema } from './run';

export const SaveStrategyInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .optional(),
  description: z.string().max(1000).optional(),
  source: z.string().min(20).max(MAX_SOURCE_CHARS),
  params: StrategyParamsSchema.optional(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
  favorite: z.boolean().optional(),
});

export type SaveStrategyInput = z.infer<typeof SaveStrategyInputSchema>;

export const StrategySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  favorite: z.boolean(),
  updatedAt: z.string(),
});

export const SaveStrategyOutputSchema = z.object({
  ok: z.boolean(),
  strategy: StrategySummarySchema,
  message: z.string(),
});

export const ListStrategiesInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const ListStrategiesOutputSchema = z.object({
  strategies: z.array(StrategySummarySchema),
});

export const ReadStrategyInputSchema = z.object({
  strategyId: z.string().min(1),
});

export const ReadStrategyOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  source: z.string(),
  params: StrategyParamsSchema,
  tags: z.array(z.string()),
});

export const DeleteStrategyInputSchema = z.object({
  strategyId: z.string().min(1),
});

export const OkOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
