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

// Central env resolution from __ENV (k6 injects -e KEY=val and OS env).
// See loadtest/README.md for the full env-var reference.

export interface SessionCtx {
  /** Strategy B only: cookies to set in the per-VU cookie jar. */
  cookies: Record<string, string>;
  /** Strategy B only: the CSRF token for state-changing requests. */
  csrfToken: string;
  /** Strategy B only: the user email (used for deterministic user pick). */
  email: string;
  /** Strategy B only: a pre-created chat thread ID for /api/chat tests. */
  threadId?: string;
}

export interface Env {
  /** Base URL of the SUT, e.g. http://localhost:3000 */
  baseUrl: string;
  /** Auth strategy: 'legacy' (AUTH_MODE=legacy, single user) or 'session' (real NextAuth). */
  authMode: 'legacy' | 'session';
  /** Strategy B: number of seeded users to distribute load across. */
  userCount: number;
  /** Strategy B: shared password for all seeded load-test users. */
  password: string;
  /** Optional CRON_SECRET for cron endpoint tests. */
  cronSecret?: string;
}

const E = (k: string, d?: string): string => ((__ENV[k] ?? d) as string | undefined) ?? '';

export const env: Env = {
  baseUrl: E('K6_BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  authMode: (E('K6_AUTH_MODE', 'legacy') as Env['authMode']) || 'legacy',
  userCount: Number.isNaN(parseInt(E('K6_USER_COUNT', ''), 10))
    ? 10
    : parseInt(E('K6_USER_COUNT', ''), 10),
  password: E('K6_TEST_PASSWORD', 'LoadTest!123'),
  cronSecret: __ENV['K6_CRON_SECRET'] || undefined,
};
