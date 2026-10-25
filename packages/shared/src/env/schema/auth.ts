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

/**
 * Auth (personal-mode):
 *   - AUTH_SECRET: HMAC secret for Auth.js JWT signing.
 *   - AUTH_COOKIE_SECRET: legacy cookie signer. Optional — kept for
 *     backward compatibility with personal-mode deployments.
 *   - CRON_SECRET: bearer token Vercel uses to invoke /api/cron/*.
 *   - ENCRYPTION_SECRET: 32-byte hex used to encrypt BYOK payloads.
 *   - AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET: optional Google OAuth client.
 *     Both must be present for the Google provider to be registered.
 *
 * Development ergonomics: in NODE_ENV !== 'production' the secrets
 * are OPTIONAL. The web app's `getServerEnv()`/`getAuthEnv()` will
 * auto-generate cryptographically-strong values when missing and
 * persist them to `.kestrel/dev-secrets.json` so encrypted BYOK payloads
 * survive restarts. Production-time enforcement is applied at the
 * ServerEnvSchema refinement below.
 */
import { z } from 'zod';

export const AuthEnv = z.object({
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars').optional(),
  AUTH_COOKIE_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 chars').optional(),
  ENCRYPTION_SECRET: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'ENCRYPTION_SECRET must be a 64-character hex string (32 bytes, e.g. openssl rand -hex 32)',
    )
    .optional(),
  // Declared here so parseServerEnv() retains them: Zod strips unknown keys,
  // and createAuthProviders() reads the parsed object rather than process.env.
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
});
