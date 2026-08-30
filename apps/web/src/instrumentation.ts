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

export async function register() {
  // Phase 3 §3.9 — load secrets from vault (GCP Secret Manager) before
  // anything else runs. No-op when SECRETS_VAULT_PROVIDER is unset or 'none'.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadSecretsFromVault } = await import('@kestrel/shared/vault');
    await loadSecretsFromVault();
    // Fail closed during the Node server startup path as well as in
    // request callbacks. Vault loading must happen first because it may
    // provide AUTH_SECRET for managed deployments.
    const { assertProductionSecurity } = await import('./lib/security-invariants');
    assertProductionSecurity();
    // Start Langfuse only in the Node runtime. Never import the exporter in
    // Edge middleware or client bundles because it depends on Node APIs.
    const { initLangfuse } = await import('@kestrel/ai/instrumentation');
    initLangfuse({ service: 'web' });
    // Eagerly initialize Mastra storage schema so the first chat request
    // doesn't pay the one-time DDL cost. Non-fatal: lazy init retries.
    const { initializeKestrelMastra } = await import('@kestrel/ai/mastra');
    await initializeKestrelMastra().catch((err: unknown) => {
      console.warn(
        '[instrumentation] Mastra storage init failed (non-fatal; lazy init will retry)',
        err,
      );
    });
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
