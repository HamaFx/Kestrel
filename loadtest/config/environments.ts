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
  cookies: Record<string, string>;
  csrfToken: string;
  email: string;
  userId?: string;
  tenantId?: string;
  threadId?: string;
}

export interface Env {
  baseUrl: string;
  authMode: 'session' | 'legacy';
  userCount: number;
  password: string;
  cronSecret?: string;
  workerHealthUrl: string;
  workerHealthToken?: string;
  workerProxyUrl: string;
  workerProxyToken?: string;
}

const g = globalThis as unknown as {
  __ENV?: Record<string, string | undefined>;
  process?: { env?: Record<string, string | undefined> };
};
const rawEnv = g.__ENV ?? g.process?.env ?? {};
const E = (k: string, d?: string): string => ((rawEnv[k] ?? d) as string | undefined) ?? '';

export const env: Env = {
  baseUrl: E('K6_BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  authMode: (E('K6_AUTH_MODE', 'session') as Env['authMode']) || 'session',
  userCount: Number.isNaN(parseInt(E('K6_USER_COUNT', ''), 10))
    ? 10
    : parseInt(E('K6_USER_COUNT', ''), 10),
  password: E('K6_TEST_PASSWORD', 'LoadTest!123'),
  cronSecret: rawEnv['K6_CRON_SECRET'] || undefined,
  workerHealthUrl: E('K6_WORKER_HEALTH_URL', 'http://localhost:8081').replace(/\/$/, ''),
  workerHealthToken: rawEnv['K6_WORKER_HEALTH_TOKEN'] || undefined,
  workerProxyUrl: E('K6_WORKER_PROXY_URL', 'http://localhost:8082').replace(/\/$/, ''),
  workerProxyToken: rawEnv['K6_WORKER_PROXY_TOKEN'] || undefined,
};
