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

// M-02 — generic macro extension schema for non-XAUUSD symbols.
//
// Defined here (not in `symbol-research`) so the assembler can parse its own
// output without an import cycle; the symbol-research barrel re-exports the
// schema and type alongside `XauusdExtension`.

import { z } from 'zod';

/**
 * M-02 (audit 2026-10-18) — generic macro extension for non-XAUUSD symbols.
 * The fundamental/risk/sentiment desks previously saw candles only for
 * forex/crypto; this extension carries the macro evidence they are prompted
 * to reason about: recent headlines, the next high-impact calendar releases
 * for the symbol's currencies, and (when the instrument supports it) the
 * latest CFTC positioning rows.
 */
export const GenericMacroExtensionSchema = z.object({
  evidenceId: z.string().min(1),
  source: z.string().min(1),
  news: z
    .array(
      z.object({
        title: z.string().min(1),
        source: z.string().optional(),
        publishedAt: z.string().optional(),
      }),
    )
    .max(3),
  events: z
    .array(
      z.object({
        name: z.string().min(1),
        currency: z.string().nullable(),
        importance: z.string().nullable(),
        date: z.string().min(1),
        actual: z.number().nullable(),
        forecast: z.number().nullable(),
        previous: z.number().nullable(),
      }),
    )
    .max(5),
  cot: z
    .array(
      z.object({
        reportDate: z.string().min(1),
        dealerNet: z.number().nullable(),
        assetNet: z.number().nullable(),
        leveragedNet: z.number().nullable(),
        otherNet: z.number().nullable(),
      }),
    )
    .max(3)
    .optional(),
  warnings: z.array(z.string()),
});
export type GenericMacroExtension = z.infer<typeof GenericMacroExtensionSchema>;
