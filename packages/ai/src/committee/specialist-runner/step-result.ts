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

// Specialist step-result normalization (DEC-05 split from
// specialist-runner.ts) — the typed schema, one-off step outputs, and the
// schema-validated readers used at the workflow boundary.

import { z } from 'zod';

import {
  CollectPacketOutputSchema,
  MastraSpecialistNameSchema,
  OpinionSchema,
  StatsSchema,
  type CollectPacketOutput,
  type MastraSpecialistName,
} from '../types';

/** Typed output of one specialist step (replaces broad `unknown` casts). */
export const SpecialistStepResultSchema = z.object({
  ok: z.boolean(),
  agentName: MastraSpecialistNameSchema.optional(),
  opinion: OpinionSchema.optional(),
  stats: StatsSchema.optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
  costUsd: z.number().optional(),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});
export type SpecialistStepResult = z.infer<typeof SpecialistStepResultSchema>;

/**
 * Read one specialist step result through the typed schema. Inside a step,
 * `getStepResult` returns the raw step output; this helper is the single
 * schema-validated cast at the workflow boundary.
 */
export function readSpecialistStepResult(
  getStepResult: (stepId: string) => unknown,
  name: MastraSpecialistName,
): SpecialistStepResult | undefined {
  return readStepResult(getStepResult, name, SpecialistStepResultSchema);
}

/**
 * A-01 — read a specialist step result by an explicit step id. Comparison
 * runs register one technical step per symbol (`technical-xauusd`, …), so
 * the fixed `MastraSpecialistName` ids no longer describe every step.
 */
export function readSpecialistStepResultById(
  getStepResult: (stepId: string) => unknown,
  stepId: string,
): SpecialistStepResult | undefined {
  return readStepResult(getStepResult, stepId, SpecialistStepResultSchema);
}

/** Read the collect-packet stage output through its typed schema. */
export function readCollectPacketResult(
  getStepResult: (stepId: string) => unknown,
): CollectPacketOutput | undefined {
  return readStepResult(getStepResult, 'collect-packet', CollectPacketOutputSchema);
}

function readStepResult<T>(
  getStepResult: (stepId: string) => unknown,
  stepId: string,
  schema: z.ZodType<T>,
): T | undefined {
  const raw = getStepResult(stepId);
  if (raw === undefined) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
