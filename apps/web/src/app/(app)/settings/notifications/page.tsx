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

// SPDX-License-Identifier: Apache-2.0

import { listPushSubscriptions } from '@kestrel/ai';
import { getUserWithSettings } from '@kestrel/db';
import type { NoiseConfig } from '@kestrel/shared';
import { IconBell, IconMail, IconMessageCircle } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getServerEnv } from '@/lib/env';
import { cn } from '@/lib/formatters/cn';

import { EnableWebPushButton } from '../_components/notifications/enable-web-push-button';
import { NoiseControlCard } from '../_components/notifications/noise-control-card';
import { NotificationPrefsCard } from '../_components/notifications/notification-prefs-card';
import { TestEmailButton } from '../_components/notifications/test-email-button';
import { RowDivider } from '../_components/row-divider';
import { SettingsRow } from '../_components/settings-row';

export const metadata: Metadata = {
  title: 'Notifications & Telegram · Settings',
  description: 'Configure alert delivery channels, Telegram bot linking, and quiet hours.',
};
export const revalidate = 60;

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const { settings } = await getUserWithSettings(userId);

  const notificationPrefs = settings?.notificationPreferences as Record<
    string,
    Record<string, boolean>
  > | null;
  const noiseConfig =
    notificationPrefs && typeof notificationPrefs === 'object'
      ? ((notificationPrefs as Record<string, unknown>).noiseConfig as NoiseConfig | undefined)
      : undefined;

  const env = getServerEnv();
  const emailReady = Boolean(env.RESEND_API_KEY) && Boolean(env.ALERT_FROM_EMAIL);
  const pushReady = Boolean(env.VAPID_PUBLIC_KEY) && Boolean(env.VAPID_PRIVATE_KEY);
  // Per-user Telegram delivery is owned by the Telegram Copilot plugin
  // (personal bot token + linked chat). The platform bot token only gates
  // whether the channel is available at all.
  const telegramReady = Boolean(env.TELEGRAM_BOT_TOKEN);

  let pushDevices = 0;
  try {
    const subs = await listPushSubscriptions(userId);
    pushDevices = subs.length;
  } catch {
    // silently skip
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Notifications & Telegram</h2>
        <p className="text-fg-subtle text-sm">
          Manage email, browser push, Telegram bot linking, and quiet hours for your market alerts.
        </p>
      </div>

      {/* Channel Test Buttons */}
      <section className="surface-panel flex flex-col gap-1 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
        <header className="flex items-center gap-3 pb-2">
          <h3 className="text-fg text-base font-semibold tracking-tight">Delivery Channels</h3>
        </header>

        <SettingsRow
          icon={<IconMail className="size-4" />}
          label="Email Alerts"
          description={
            <span className="flex items-center gap-2">
              <StatusPill ready={emailReady} />
              <span>Send a test notification to your account email address</span>
            </span>
          }
          stack
          action={<TestEmailButton />}
        />

        <RowDivider />

        <SettingsRow
          icon={<IconBell className="text-brand size-4" />}
          label="Browser Push"
          description={
            <span className="flex items-center gap-2">
              <StatusPill ready={pushReady} />
              <span>
                {pushReady
                  ? `${pushDevices} device${pushDevices === 1 ? '' : 's'} subscribed`
                  : 'Enable browser notifications on this device'}
              </span>
            </span>
          }
          stack
          action={<EnableWebPushButton />}
        />

        <RowDivider />

        <SettingsRow
          icon={<IconMessageCircle className="text-brand size-4" />}
          label="Telegram Alerts"
          description={
            <span className="flex items-center gap-2">
              <StatusPill ready={telegramReady} />
              <span>
                Link your personal bot and chat, then send a test message from Telegram Copilot
              </span>
            </span>
          }
          stack
          action={
            <Link
              href="/plugins/telegram-bot"
              className="border-border/60 text-fg-muted hover:text-fg inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors hover:border-white/20"
            >
              Configure in Telegram Copilot →
            </Link>
          }
        />
      </section>

      <NoiseControlCard initialConfig={noiseConfig ?? null} />
      <NotificationPrefsCard initialPrefs={notificationPrefs} />
    </div>
  );
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tabular-nums ring-1',
        ready
          ? 'bg-success/10 text-success ring-success/30'
          : 'bg-bg-elev-2 text-fg-subtle ring-divider',
      )}
    >
      <span
        aria-hidden
        className={ready ? 'bg-success size-1 rounded-full' : 'bg-fg-subtle size-1 rounded-full'}
      />
      {ready ? 'Ready' : 'Standby'}
    </span>
  );
}
