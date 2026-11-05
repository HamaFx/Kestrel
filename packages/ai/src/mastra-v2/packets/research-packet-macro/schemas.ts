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

// Unified macro evidence schema for every research-packet symbol.
//
// Macro context used to live in two shapes: `xauusdExtension` for gold and
// `genericMacro` for the other 17 symbols. Downstream consumers only read the
// gold shape, so non-gold macro numbers were silently ungrounded. One schema
// keeps every consumer on the same evidence contract.

import { z } from 'zod';

const MacroSeriesPointSchema = z.object({
  asOf: z.string().min(1),
  value: z.number(),
});

const MacroEventSchema = z.object({
  name: z.string().min(1),
  currency: z.string().nullable(),
  importance: z.string().nullable(),
  date: z.string().min(1),
  actual: z.number().nullable(),
  forecast: z.number().nullable(),
  previous: z.number().nullable(),
});

const MacroNewsItemSchema = z.object({
  title: z.string().min(1),
  source: z.string().optional(),
  publishedAt: z.string().optional(),
});

const MacroCotRowSchema = z.object({
  reportDate: z.string().min(1),
  dealerNet: z.number().nullable(),
  assetNet: z.number().nullable(),
  leveragedNet: z.number().nullable(),
  otherNet: z.number().nullable(),
});

/**
 * Optional FRED-backed series. Populated for gold and for instruments whose
 * quote currency is USD; other symbols omit the field rather than carrying an
 * empty shape that looks like a checked source.
 */
const MacroFredSeriesSchema = z.object({
  dollarIndex: z.array(MacroSeriesPointSchema).max(10),
  realYields: z.array(MacroSeriesPointSchema).max(10),
  breakevenInflation: z.array(MacroSeriesPointSchema).max(10),
});

export const MacroEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  source: z.string().min(1),
  news: z.array(MacroNewsItemSchema).max(8),
  events: z.array(MacroEventSchema).max(10),
  cot: z.array(MacroCotRowSchema).max(3).optional(),
  fredSeries: MacroFredSeriesSchema.optional(),
  warnings: z.array(z.string()),
});

export type MacroEvidence = z.infer<typeof MacroEvidenceSchema>;
export type MacroEvent = z.infer<typeof MacroEventSchema>;
export type MacroNewsItem = z.infer<typeof MacroNewsItemSchema>;
export type MacroCotRow = z.infer<typeof MacroCotRowSchema>;
