// SPDX-License-Identifier: Apache-2.0

// Server-side status probe for the system status card: notification channel
// readiness from env, push subscription count, and cron health counters.

import { listPushSubscriptions } from '@kestrel/ai';
import { getDb } from '@kestrel/db';
import { sql } from 'drizzle-orm';
import { cache } from 'react';

import { getServerEnv } from '@/lib/env';

export interface ChannelStatus {
  label: string;
  ready: boolean;
  detail: string;
}

export interface BuildStatusResult {
  channels: ChannelStatus[];
  pushCount: number;
  databaseConnected: boolean;
  stuckJobs: number;
  recentErrors: number;
}

export const buildStatuses = cache(async (userId: string): Promise<BuildStatusResult> => {
  const env = getServerEnv();
  const channels: ChannelStatus[] = [
    {
      label: 'Email',
      ready:
        Boolean(env.RESEND_API_KEY) && Boolean(env.ALERT_FROM_EMAIL) && Boolean(env.ALERT_TO_EMAIL),
      detail: env.ALERT_TO_EMAIL ? `→ ${env.ALERT_TO_EMAIL}` : 'Not configured',
    },
    {
      label: 'Telegram',
      ready: Boolean(env.TELEGRAM_BOT_TOKEN) && Boolean(env.TELEGRAM_CHAT_ID),
      detail: env.TELEGRAM_CHAT_ID ? `Chat ${env.TELEGRAM_CHAT_ID}` : 'Not configured',
    },
    {
      label: 'Web push',
      ready: Boolean(env.VAPID_PUBLIC_KEY) && Boolean(env.VAPID_PRIVATE_KEY),
      detail: env.VAPID_PUBLIC_KEY ? 'VAPID keys present' : 'Not configured',
    },
  ];

  let pushCount = 0;
  let databaseConnected = false;
  let stuckJobs = 0;
  let recentErrors = 0;
  try {
    const subs = await listPushSubscriptions(userId);
    pushCount = subs.length;
    databaseConnected = true;

    // OBS-04: Query cron_runs for stuck/errored jobs in last 24h.
    try {
      const db = getDb();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [row] = await db.execute<{ stuck: string; errors: string }>(sql`
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'started' AND started_at < now() - INTERVAL '5 minutes'
          )::text AS stuck,
          COUNT(*) FILTER (WHERE status = 'error')::text AS errors
        FROM cron_runs
        WHERE started_at >= ${since}
      `);
      stuckJobs = Number((row as { stuck: string; errors: string })?.stuck ?? 0);
      recentErrors = Number((row as { stuck: string; errors: string })?.errors ?? 0);
    } catch {
      // cron_runs not yet migrated — silently skip
    }
  } catch {
    console.error('[settings] failed to list push subscriptions');
  }

  // Patch the web push detail with the live count.
  const webPush = channels[2];
  if (webPush?.ready) {
    webPush.detail =
      pushCount > 0
        ? `${pushCount} device${pushCount === 1 ? '' : 's'} subscribed`
        : 'Configured · 0 devices';
  }

  return { channels, pushCount, databaseConnected, stuckJobs, recentErrors };
});
