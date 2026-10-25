// SPDX-License-Identifier: Apache-2.0

// Icon + window constants for the System Health dashboard.

import {
  IconActivity,
  IconClock,
  IconDatabaseCog,
  IconHeartbeat,
  IconMessage,
  IconRoute,
  IconShieldCheck,
  IconTool,
  IconWallet,
} from '@tabler/icons-react';

import type { SliSnapshot } from '@/lib/services/admin-dtos';

/** Per-SLI icon; unknown keys fall back to `IconActivity`. */
export const SLI_ICONS: Record<string, typeof IconActivity> = {
  worker_ticks: IconActivity,
  cron_jobs: IconClock,
  ai_gateway: IconTool,
  chat_api: IconMessage,
  full_mode_completion: IconRoute,
  sentiment_health: IconHeartbeat,
  persistence_outbox: IconDatabaseCog,
  budget_recovery: IconWallet,
  trace_sink: IconShieldCheck,
  provider_fallback_free: IconRoute,
};

export const HEALTH_WINDOWS = [
  { hours: 1, label: '1h' },
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' },
  { hours: 720, label: '30d' },
] as const;

export type { SliSnapshot };
