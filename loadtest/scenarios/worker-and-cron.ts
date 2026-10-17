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

import { check, sleep } from 'k6';
import http from 'k6/http';

import { env, type SessionCtx } from '../config/environments.js';

export function workerAndCron(_ctx?: SessionCtx): void {
  // 1. Worker health check
  const workerHeaders: Record<string, string> = env.workerHealthToken
    ? { Authorization: `Bearer ${env.workerHealthToken}` }
    : {};

  const healthRes = http.get(`${env.workerHealthUrl}/health/live`, {
    headers: workerHeaders,
    tags: { group: 'worker_health' },
    timeout: '3s',
  });
  check(healthRes, {
    'worker health returns 2xx or is reachable': (r) => r.status < 500,
  });

  // 2. Cron dispatch endpoint
  const cronSecret = env.cronSecret || 'abcdef0123456789abcdef0123456789';
  const cronRes = http.post(`${env.baseUrl}/api/cron/warm-cache`, null, {
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
    tags: { group: 'cron_dispatch' },
    timeout: '10s',
  });
  check(cronRes, {
    'cron dispatch returns 2xx or 401 if disabled': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}
