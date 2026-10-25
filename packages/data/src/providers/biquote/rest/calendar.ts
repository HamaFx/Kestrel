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

// 54-Country MT5 Economic Calendar endpoints.

import { BiquoteCalendarEventSchema, type BiquoteCalendarEvent } from '@kestrel/shared';
import { z } from 'zod';

import { call, type CallOptions } from './call';

const CalendarArraySchema = z.array(BiquoteCalendarEventSchema);

export interface FetchBiquoteCalendarArgs extends CallOptions {
  /** ISO-8601 UTC start timestamp (-90d max). */
  from?: string;
  /** ISO-8601 UTC end timestamp (+90d max). */
  to?: string;
  /** Comma-separated ISO country codes, e.g. "US,EU,GB,JP,CA,AU,NZ,CH". */
  countries?: string;
  importance?: 'low' | 'medium' | 'high';
  type?: 'event' | 'indicator' | 'holiday';
  /** Max events to return (1..500, default 200). */
  limit?: number;
}

/**
 * Fetch date-bounded economic calendar events from BiQuote (`GET /api/calendar`).
 */
export async function fetchCalendar(
  args: FetchBiquoteCalendarArgs = {},
): Promise<BiquoteCalendarEvent[]> {
  const limit = args.limit ? Math.max(1, Math.min(args.limit, 500)) : 200;
  return call(
    '/api/calendar',
    {
      limit: String(limit),
      ...(args.from ? { from: args.from } : {}),
      ...(args.to ? { to: args.to } : {}),
      ...(args.countries ? { countries: args.countries } : {}),
      ...(args.importance ? { importance: args.importance } : {}),
      ...(args.type ? { type: args.type } : {}),
    },
    CalendarArraySchema,
    args,
  );
}

export interface FetchBiquoteCalendarUpcomingArgs extends CallOptions {
  /** Max events to return (1..500, default 100). */
  limit?: number;
  /** Comma-separated ISO country codes. */
  countries?: string;
  importance?: 'low' | 'medium' | 'high';
}

/**
 * Fetch upcoming economic calendar events over the next 30 days (`GET /api/calendar/upcoming`).
 */
export async function fetchCalendarUpcoming(
  args: FetchBiquoteCalendarUpcomingArgs = {},
): Promise<BiquoteCalendarEvent[]> {
  const limit = args.limit ? Math.max(1, Math.min(args.limit, 500)) : 100;
  return call(
    '/api/calendar/upcoming',
    {
      limit: String(limit),
      ...(args.countries ? { countries: args.countries } : {}),
      ...(args.importance ? { importance: args.importance } : {}),
    },
    CalendarArraySchema,
    args,
  );
}
