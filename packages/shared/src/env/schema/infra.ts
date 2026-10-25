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

// Cache, market-data provider, notification and public (browser-readable) env
// groups.

import { z } from 'zod';

// Upstash Redis is intentionally OPTIONAL. Personal-mode caching uses Next.js's
// built-in Data Cache (`fetch`-cache + `unstable_cache`) which is free, persists
// across invocations on Vercel, and covers our entire TTL policy. Setting these
// vars is supported as a future swap-in but no code path requires them today.
//
// See docs/04-data-layer.md § "Cache layer" and packages/data/src/cache/.
export const CacheEnv = z.object({
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

export const ProvidersEnv = z.object({
  // BiQuote is the primary; Finnhub is the fallback.
  FINNHUB_API_KEY: z.string().min(1).optional(),
  MARKETAUX_API_KEY: z.string().min(1).optional(),
  FRED_API_KEY: z.string().min(1).optional(),
  /**
   * BiQuote (https://biquote.io) — free, no-key REST + SignalR market data.
   * Phase 8 promotes BiQuote to the primary price/candle source. There is
   * no API key; this var only overrides the base URL (e.g. for staging or a
   * local mock during tests). Default: https://biquote.io.
   */
  BIQUOTE_BASE_URL: z.url().optional(),
  /** Server-only web research providers. Never expose these to the browser. */
  EXA_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
});

export const NotifyEnv = z.object({
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_SECRET_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM_EMAIL: z.email().optional(),
  ALERT_TO_EMAIL: z.email().optional(),
  /**
   * Web Push (RFC 8030 + VAPID). All optional — when missing, the
   * `web-push` alert channel returns "not configured" and skips delivery.
   *
   * The public key MUST also be exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY so
   * the browser-side `pushManager.subscribe` call can pass it as the
   * `applicationServerKey`. The two values must match exactly.
   *
   * Generate a fresh keypair with:
   *   node -e "const {generateKeyPairSync} = require('crypto'); \
   *     const {publicKey, privateKey} = generateKeyPairSync('ec', { namedCurve: 'P-256' }); \
   *     console.log('PUB',  publicKey.export({format:'jwk'}).x + publicKey.export({format:'jwk'}).y); \
   *     console.log('PRIV', privateKey.export({format:'jwk'}).d);"
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** Contact email or `mailto:` URL embedded in the VAPID JWT `sub` claim. */
  VAPID_SUBJECT: z.string().optional(),
});

export const PublicEnv = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  /** Browser-readable VAPID public key. MUST equal `VAPID_PUBLIC_KEY`. */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
});
