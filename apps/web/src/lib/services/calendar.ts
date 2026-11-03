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

// PF-22 — Calendar service layer.
//
// Handles economic calendar event retrieval.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import { listUpcomingEvents, upsertEvents } from '@kestrel/ai';
import { fetchUpcomingEvents, ProviderError } from '@kestrel/data';
import { withRateLimit } from '@kestrel/db';
import type { EconomicEvent } from '@kestrel/shared';

import type { CategorizedLogger } from '@/lib/logger';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CalendarEventDTO {
  id: string;
  title: string;
  date: string;
  impact: string;
  forecast?: string | null;
  previous?: string | null;
  [key: string]: unknown;
}

const CALENDAR_RATE_LIMIT = Number(process.env.CALENDAR_RATE_LIMIT) || 60;
const CALENDAR_REFRESH_RATE_LIMIT = 4;

// ── DTO mappers ──────────────────────────────────────────────────────────────

/**
 * Map domain EconomicEvent → CalendarEventDTO.
 * Handles timestamp→ISO string conversion and field name mapping
 * (importance→impact, forecast/previous number→string).
 * Preserves all extended fields (country, currency, actual, etc.) via destructure-spread.
 */
function toCalendarEventDTO(e: EconomicEvent): CalendarEventDTO {
  const { date, importance, forecast, previous, ...rest } = e;
  return {
    ...rest, // preserve country, currency, actual, unit, source, etc.
    id: e.id,
    title: e.title,
    date: new Date(date).toISOString(),
    impact: importance, // domain uses 'importance', API contract uses 'impact'
    forecast: forecast != null ? String(forecast) : null,
    previous: previous != null ? String(previous) : null,
  };
}

// ── Service functions ────────────────────────────────────────────────────────

export async function checkCalendarRateLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
}> {
  const rl = await withRateLimit(userId, 'calendar_read', CALENDAR_RATE_LIMIT);
  return { allowed: rl.allowed, count: rl.count, limit: rl.limit };
}

/**
 * Per-user bucket for the user-facing calendar refresh button. Separate from
 * the read bucket so a refresh cannot exhaust the page's read allowance, and
 * from the scheduler path, which is bearer-authenticated and never rate
 * limited here.
 */
export async function checkCalendarRefreshRateLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
}> {
  const rl = await withRateLimit(userId, 'calendar_refresh', CALENDAR_REFRESH_RATE_LIMIT);
  return { allowed: rl.allowed, count: rl.count, limit: rl.limit };
}

export interface CalendarRefreshResult {
  processed: number;
  note: string;
}

/**
 * Pull upcoming calendar events and upsert them.
 *
 * A ProviderError is a "skip this tick" event, not a failure: the upstream
 * times out periodically, the next run retries, and the rows already stored
 * stay valid. Shared by `/api/cron/calendar` (scheduler/admin) and
 * `/api/calendar/refresh` (any signed-in user).
 */
export async function refreshCalendarService(
  log: CategorizedLogger,
): Promise<CalendarRefreshResult> {
  try {
    const events = await fetchUpcomingEvents();
    const { inserted } = await upsertEvents(events);
    return {
      processed: events.length,
      note: `upserted=${inserted}`,
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      log.warn('calendar provider skipped', {
        provider: err.provider,
        code: err.code,
        message: err.message,
      });
      return {
        processed: 0,
        note: `provider ${err.provider} unavailable (${err.code})`,
      };
    }
    throw err;
  }
}

export async function listEventsService(): Promise<CalendarEventDTO[]> {
  const events = await listUpcomingEvents();
  return events.map(toCalendarEventDTO);
}
