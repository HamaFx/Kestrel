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

// SPDX-License-Identifier: Apache-2.0

// Critique/debate step schemas (DEC-05 split from critique.ts) — the typed
// markers written by the critique and debate steps, plus the aggregate step
// outputs read at the workflow boundary.

import { z } from 'zod';

import { CommitteeCritiqueSchema, MastraModeOpinionSchema } from '../types';

/** Typed output of the critique step (mirrors the specialist marker shape). */
export const CritiqueStepResultSchema = z.object({
  ok: z.boolean(),
  agentName: z.string().optional(),
  critique: CommitteeCritiqueSchema.optional(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type CritiqueStepResult = z.infer<typeof CritiqueStepResultSchema>;

export const CritiqueStepOutputSchema = z.object({
  critiques: z.array(CommitteeCritiqueSchema),
  failedAgents: z.array(z.string()),
});
export type CritiqueStepOutput = z.infer<typeof CritiqueStepOutputSchema>;

export const DebateStepResultSchema = z.object({
  ok: z.boolean(),
  agentName: z.string().optional(),
  opinion: MastraModeOpinionSchema.optional(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type DebateStepResult = z.infer<typeof DebateStepResultSchema>;

export const DebateStepOutputSchema = z.object({
  revisions: z.array(MastraModeOpinionSchema),
  failedAgents: z.array(z.string()),
});
export type DebateStepOutput = z.infer<typeof DebateStepOutputSchema>;
