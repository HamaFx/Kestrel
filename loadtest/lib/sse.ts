import { check } from 'k6';
import http from 'k6/http';

import { env } from '../config/environments.js';
import { record429, recordAuthFailure } from './checks.js';
import { getCsrfHeader } from './http.js';

export interface ParsedSseResult {
  eventCount: number;
  byteLength: number;
  hasTerminalEvent: boolean;
  events: Array<{ data: string }>;
}

export function parseSseBody(rawBody: string): ParsedSseResult {
  if (!rawBody) {
    return { eventCount: 0, byteLength: 0, hasTerminalEvent: false, events: [] };
  }
  const events: Array<{ data: string }> = [];
  let hasTerminalEvent = false;
  for (const line of rawBody.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      events.push({ data: payload });
      if (
        payload.includes('"text-end"') ||
        payload.includes('"turn-complete"') ||
        payload.includes('"ticks"') ||
        payload === '[DONE]'
      ) {
        hasTerminalEvent = true;
      }
    }
  }
  return {
    eventCount: events.length,
    byteLength: rawBody.length,
    hasTerminalEvent,
    events,
  };
}

export function postSseStream(
  path: string,
  group: string,
  payload: unknown,
): { status: number; ttfbMs: number; totalMs: number; parsed: ParsedSseResult } {
  const res = http.post(`${env.baseUrl}${path}`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...getCsrfHeader(),
    },
    tags: { group },
  });
  record429(res);
  recordAuthFailure(res);
  const bodyStr = typeof res.body === 'string' ? res.body : '';
  const parsed = parseSseBody(bodyStr);
  check(res, {
    'sse status is 200': (r) => r.status === 200,
    'sse emitted events': () => parsed.eventCount > 0,
  });
  return {
    status: res.status,
    ttfbMs: res.timings.waiting,
    totalMs: res.timings.duration,
    parsed,
  };
}

export function getSseStream(
  path: string,
  group: string,
  timeoutMs = 7_000,
): { status: number; ttfbMs: number; totalMs: number; parsed: ParsedSseResult } {
  const res = http.get(`${env.baseUrl}${path}`, {
    headers: { Accept: 'text/event-stream' },
    tags: { group },
    timeout: `${timeoutMs}ms`,
  });
  record429(res);
  recordAuthFailure(res);
  const bodyStr = typeof res.body === 'string' ? res.body : '';
  const parsed = parseSseBody(bodyStr);
  check(res, {
    'sse status is 200': (r) => r.status === 200,
    'sse emitted events': () => parsed.eventCount > 0,
  });
  return {
    status: res.status,
    ttfbMs: res.timings.waiting,
    totalMs: res.timings.duration,
    parsed,
  };
}
