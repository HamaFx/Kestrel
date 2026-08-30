/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

export type CapabilityStatus = 'enabled' | 'disabled';

export interface Capability {
  name: string;
  status: CapabilityStatus;
  reason?: string;
}

export interface CapabilityReport {
  capabilities: Capability[];
  enabled: string[];
  disabled: string[];
}

function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * Build a redacted capability report. Values are never included in the
 * result; only presence and the reason a feature is unavailable are exposed.
 */
export function getCapabilityReport(env: NodeJS.ProcessEnv = process.env): CapabilityReport {
  const offlineMode = env.KESTREL_OFFLINE_MODE === '1' || env.KESTREL_OFFLINE_MODE === 'true';
  const capabilities: Capability[] = [
    {
      name: 'offline-market-data',
      status: offlineMode ? 'enabled' : 'disabled',
      reason: offlineMode
        ? 'deterministic synthetic provider; no market-data network requests are made'
        : 'KESTREL_OFFLINE_MODE is not enabled',
    },
    {
      name: 'database',
      status: configured(env.DATABASE_URL) || configured(env.POSTGRES_URL) ? 'enabled' : 'disabled',
      ...(configured(env.DATABASE_URL) || configured(env.POSTGRES_URL)
        ? {}
        : { reason: 'DATABASE_URL or POSTGRES_URL is not configured; local PGlite may be used' }),
    },
    {
      name: 'ai-server-fallback',
      status:
        configured(env.AI_GATEWAY_API_KEY) ||
        configured(env.GOOGLE_GENERATIVE_AI_API_KEY) ||
        configured(env.GOOGLE_VERTEX_PROJECT)
          ? 'enabled'
          : 'disabled',
      ...(configured(env.AI_GATEWAY_API_KEY) ||
      configured(env.GOOGLE_GENERATIVE_AI_API_KEY) ||
      configured(env.GOOGLE_VERTEX_PROJECT)
        ? {}
        : { reason: 'no server-level AI fallback; configure BYOK in the application' }),
    },
    {
      name: 'biquote',
      status: 'enabled',
      reason: 'built-in provider endpoint is available; upstream availability is runtime-dependent',
    },
    {
      name: 'finnhub',
      status: configured(env.FINNHUB_API_KEY) ? 'enabled' : 'disabled',
      ...(configured(env.FINNHUB_API_KEY) ? {} : { reason: 'FINNHUB_API_KEY is not configured' }),
    },
    {
      name: 'fred',
      status: configured(env.FRED_API_KEY) ? 'enabled' : 'disabled',
      ...(configured(env.FRED_API_KEY) ? {} : { reason: 'FRED_API_KEY is not configured' }),
    },
    {
      name: 'telegram',
      status: configured(env.TELEGRAM_BOT_TOKEN) ? 'enabled' : 'disabled',
      ...(configured(env.TELEGRAM_BOT_TOKEN)
        ? {}
        : { reason: 'TELEGRAM_BOT_TOKEN is not configured' }),
    },
    {
      name: 'email',
      status: configured(env.RESEND_API_KEY) ? 'enabled' : 'disabled',
      ...(configured(env.RESEND_API_KEY) ? {} : { reason: 'RESEND_API_KEY is not configured' }),
    },
    {
      name: 'sentry',
      status: configured(env.SENTRY_DSN) ? 'enabled' : 'disabled',
      ...(configured(env.SENTRY_DSN) ? {} : { reason: 'SENTRY_DSN is not configured' }),
    },
    {
      name: 'langfuse',
      status:
        configured(env.LANGFUSE_PUBLIC_KEY) &&
        configured(env.LANGFUSE_SECRET_KEY) &&
        configured(env.LANGFUSE_BASE_URL)
          ? 'enabled'
          : 'disabled',
      ...(configured(env.LANGFUSE_PUBLIC_KEY) &&
      configured(env.LANGFUSE_SECRET_KEY) &&
      configured(env.LANGFUSE_BASE_URL)
        ? {}
        : { reason: 'Langfuse public key, secret key, and base URL must all be configured' }),
    },
    {
      name: 'langfuse-prompt-output-capture',
      status:
        env.LANGFUSE_RECORD_IO === '1' || env.LANGFUSE_RECORD_IO === 'true'
          ? 'enabled'
          : 'disabled',
      ...(env.LANGFUSE_RECORD_IO === '1' || env.LANGFUSE_RECORD_IO === 'true'
        ? { reason: 'prompt/output capture is explicitly enabled' }
        : { reason: 'privacy-preserving default' }),
    },
    {
      name: 'billing',
      status:
        env.BILLING_ENABLED === '1' || env.BILLING_ENABLED === 'true' ? 'enabled' : 'disabled',
      ...(env.BILLING_ENABLED === '1' || env.BILLING_ENABLED === 'true'
        ? {}
        : { reason: 'BILLING_ENABLED is not enabled' }),
    },
  ];

  return {
    capabilities,
    enabled: capabilities
      .filter((capability) => capability.status === 'enabled')
      .map((capability) => capability.name),
    disabled: capabilities
      .filter((capability) => capability.status === 'disabled')
      .map((capability) => capability.name),
  };
}
