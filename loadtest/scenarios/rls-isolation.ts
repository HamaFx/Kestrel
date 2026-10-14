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
import { rlsViolations } from '../lib/metrics.js';

export function rlsIsolation(ctxA: SessionCtx, ctxB?: SessionCtx): void {
  // 1. Cross-tenant isolation check: User A tries to access User B's thread
  if (ctxB && ctxB.threadId) {
    const res = http.get(`${env.baseUrl}/api/chat/threads/${ctxB.threadId}`, {
      headers: {
        Accept: 'application/json',
      },
      tags: { group: 'rls_cross_tenant' },
    });

    const blocked = check(res, {
      'cross tenant thread read blocked (403 or 404)': (r) =>
        r.status === 403 || r.status === 404,
    });

    if (!blocked && res.status === 200) {
      rlsViolations.add(1);
    }
  }

  // 2. Unauthenticated request to protected endpoints
  const unauthedRes = http.get(`${env.baseUrl}/api/settings/symbols`, {
    jar: http.cookieJar(),
    tags: { group: 'rls_unauth' },
  });
  check(unauthedRes, {
    'unauthenticated settings access blocked': (r) =>
      r.status === 401 || r.status === 403 || r.status === 302 || r.status === 307,
  });

  sleep(0.5);
}
