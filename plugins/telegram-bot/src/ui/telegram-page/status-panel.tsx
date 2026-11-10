'use client';

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
import { PLUGIN_UI_CLASSES } from '@kestrel/plugin-sdk/ui';
import {
  IconAlertTriangle,
  IconBrandTelegram,
  IconCheck,
  IconClock,
  IconLoader2,
  IconMessageCircle,
  IconPlugConnected,
  IconRefresh,
  IconSend,
  IconUnlink,
} from '@tabler/icons-react';
import Link from 'next/link';

import type { StatusResponse } from './use-telegram-page';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? 'bg-success/10 text-success inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase'
          : 'bg-warn/10 text-warn inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase'
      }
    >
      {ok ? <IconCheck className="size-3" /> : <IconAlertTriangle className="size-3" />}
      {label}
    </span>
  );
}

function Row({
  icon,
  label,
  value,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="frame-row"
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
    >
      <span className="bg-bg-elev-2 text-fg-muted flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06]">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-fg text-sm font-semibold">{label}</span>
        <span className="text-fg-subtle truncate text-xs">{value}</span>
      </div>
      {action}
    </div>
  );
}

export function StatusPanel({
  status,
  loading,
  busy,
  onRefresh,
  onUnlink,
  onTest,
}: {
  status: StatusResponse | null;
  loading: boolean;
  busy: string | null;
  onRefresh: () => void;
  onUnlink: () => void;
  onTest: () => void;
}) {
  return (
    <section data-slot="frame" className={PLUGIN_UI_CLASSES.frame}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
        <div className="flex items-start gap-3">
          <span className="bg-brand/10 text-brand border-brand/25 flex size-11 items-center justify-center rounded-lg border">
            <IconBrandTelegram className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-fg text-base font-semibold tracking-tight">
                {status?.botUsername ? `@${status.botUsername}` : 'Telegram Copilot'}
              </h2>
              <StatusPill
                ok={Boolean(status?.connected)}
                label={status?.connected ? 'Connected' : 'Not Connected'}
              />
              <StatusPill
                ok={Boolean(status?.linked)}
                label={status?.linked ? 'Chat Connected' : 'Chat Not Connected'}
              />
            </div>
            <p className="text-fg-subtle text-sm">
              Commands, alerts, and scheduled briefings in your own Telegram bot.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className={PLUGIN_UI_CLASSES.buttonSecondary}
        >
          {loading ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconRefresh className="size-3.5" />
          )}
          Refresh
        </button>
      </div>

      <div data-slot="frame-panel" className={PLUGIN_UI_CLASSES.framePanelBand}>
        <Row
          icon={<IconPlugConnected className="size-4" />}
          label="Webhook"
          value={
            status?.webhook.configured
              ? `Connected${typeof status.webhook.pendingUpdateCount === 'number' ? ` · ${status.webhook.pendingUpdateCount} pending` : ''}`
              : 'Not connected — finish the guided setup'
          }
          action={
            <StatusPill
              ok={Boolean(status?.webhook.configured)}
              label={status?.webhook.configured ? 'Connected' : 'Not Connected'}
            />
          }
        />
        <Row
          icon={<IconMessageCircle className="size-4" />}
          label="Connected chat"
          value={
            status?.linked
              ? `${status.linked.chatId}${status.linked.linkedAt ? ` · since ${new Date(status.linked.linkedAt).toLocaleDateString()}` : ''}`
              : 'No chat connected yet'
          }
          action={
            status?.linked ? (
              <button
                type="button"
                onClick={onUnlink}
                disabled={busy !== null}
                className="text-fg-subtle hover:text-danger focus-visible:ring-brand inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
              >
                {busy === 'unlink' ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconUnlink className="size-3.5" />
                )}
                Disconnect
              </button>
            ) : null
          }
        />
        <Row
          icon={<IconClock className="size-4" />}
          label="Daily briefing"
          value={
            status?.settings.briefingEnabled
              ? `${status.settings.briefingTime} · ${status.settings.timezone}`
              : 'Off'
          }
          action={
            <Link
              href="/settings/plugins"
              className="text-brand text-xs font-semibold hover:underline"
            >
              Change
            </Link>
          }
        />
        <Row
          icon={<IconSend className="size-4" />}
          label="Alert notifications"
          value={
            status?.settings.alertsEnabled ? 'On — Telegram alerts are delivered here' : 'Off'
          }
          action={
            status?.linked ? (
              <button
                type="button"
                onClick={onTest}
                disabled={busy !== null}
                className={PLUGIN_UI_CLASSES.buttonSecondary}
              >
                {busy === 'test' ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconSend className="size-3.5" />
                )}
                Send Test
              </button>
            ) : null
          }
        />
      </div>

      {status?.webhook.lastErrorMessage ? (
        <p className="text-warn px-3 py-1 text-xs">
          Telegram reports: {status.webhook.lastErrorMessage}
        </p>
      ) : null}
      {status?.settings.lastError ? (
        <p className="text-warn px-3 py-1 text-xs">Last setup error: {status.settings.lastError}</p>
      ) : null}
    </section>
  );
}
