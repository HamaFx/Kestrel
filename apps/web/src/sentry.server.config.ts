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

import * as Sentry from '@sentry/nextjs';

// OBS-07 (Phase 5.1): Add `service:web` tag + `release` so events from
// the web app can be cleanly separated from worker events in a shared-DSN
// Sentry project. The worker already tags `service:worker`.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: !!process.env.SENTRY_DSN,
  initialScope: {
    tags: {
      service: 'web',
      ...(process.env.DEPLOYED_SHA ? { release: process.env.DEPLOYED_SHA } : {}),
    },
  },
});
