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

// OBS-06 (Phase 5.1): Client Sentry is deliberately enabled.
// `enabled` keys off `NEXT_PUBLIC_SENTRY_DSN` (the only var inlined
// into the browser bundle). The previous `!!process.env.SENTRY_DSN`
// check was always `false` in the browser because non-NEXT_PUBLIC_
// vars are stripped at build time — leaving client capture + Session
// Replay silently dead. `.env.example` already advertises
// `NEXT_PUBLIC_SENTRY_DSN`, confirming client capture was intended.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...(process.env.NEXT_PUBLIC_DEPLOYED_SHA
    ? { release: process.env.NEXT_PUBLIC_DEPLOYED_SHA }
    : {}),
  integrations: [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
