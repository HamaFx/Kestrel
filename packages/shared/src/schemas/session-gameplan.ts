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

// Pre-session gameplan: the trader's declared daily risk policy.
//
// Persisted on `user_settings.session_gameplan` so the AI risk context can read
// the same R cap and execution rule the dashboard shows. `date` is the UTC day
// the plan was locked in; consumers ignore a plan from an earlier day.

import { z } from 'zod';

export const SessionGameplanSchema = z.object({
  /** YYYY-MM-DD (UTC) the plan was locked in for. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Hard daily stop in R multiples. */
  maxDailyR: z.number().finite().positive().max(100),
  /** Free-form psychological focus for the session. */
  mindset: z.string().min(1).max(120),
  /** The one execution rule the trader committed to today. */
  primaryRule: z.string().min(1).max(280),
  newsReviewed: z.boolean(),
  strategyAligned: z.boolean(),
  /** Epoch ms the plan was saved. */
  completedAt: z.int(),
});

export type SessionGameplan = z.infer<typeof SessionGameplanSchema>;

/** True when a stored plan belongs to the given UTC day (YYYY-MM-DD). */
export function isSessionGameplanForDate(
  plan: SessionGameplan | null | undefined,
  utcDate: string,
): boolean {
  return Boolean(plan && plan.date === utcDate);
}
