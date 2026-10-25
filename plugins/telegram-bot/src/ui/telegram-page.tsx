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

// Telegram Copilot page.
//
// Self-contained: the plugin UI package cannot import the web app's `@/`
// aliases, so it uses Hoplite tokens/classes directly and talks to its own
// authenticated plugin API routes.
import {
  IconAlertTriangle,
  IconBrandTelegram,
  IconCheck,
  IconClock,
  IconExternalLink,
  IconLoader2,
  IconMessageCircle,
  IconPlugConnected,
  IconRefresh,
  IconSend,
  IconUnlink,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';

const PLUGIN_ID = 'telegram-bot';

interface StatusResponse {
  installed: boolean;
  connected: boolean;
  botUsername: string | null;
  linked: { chatId: string; linkedAt: string | null } | null;
  webhook: {
    configured: boolean;
    url?: string;
    pendingUpdateCount?: number;
    lastErrorMessage?: string;
  };
  settings: {
    alertsEnabled: boolean;
    briefingEnabled: boolean;
    briefingTime: string;
    timezone: string;
    briefingIncludePositions: boolean;
    lastError: string | null;
  };
}

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const name of ['__Host-hfx_csrf', 'hfx_csrf']) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match?.[1] !== undefined) return decodeURIComponent(match[1]);
  }
  return undefined;
}

async function pluginFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  const token = csrfToken();
  if (token) headers.set('X-CSRF-Token', token);
  if (init?.body) headers.set('content-type', 'application/json');

  const response = await fetch(`/api/plugins/${PLUGIN_ID}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
  return body as T;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? 'bg-success/10 text-success inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase'
          : 'bg-warn/10 text-warn inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase'
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
    <div className="border-border/50 flex items-center gap-3 border-b py-3 last:border-b-0">
      <span className="bg-bg-elev-2 text-fg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
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

export function TelegramPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await pluginFetch<StatusResponse>('/status');
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Telegram status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  const botUrl = status?.botUsername ? `https://t.me/${status.botUsername}` : null;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="surface-panel rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="bg-brand/10 text-brand flex size-11 items-center justify-center rounded-lg">
              <IconBrandTelegram className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-fg text-base font-semibold tracking-tight">
                  {status?.botUsername ? `@${status.botUsername}` : 'Telegram Copilot'}
                </h2>
                <StatusPill
                  ok={Boolean(status?.connected)}
                  label={status?.connected ? 'Connected' : 'Not configured'}
                />
                <StatusPill
                  ok={Boolean(status?.linked)}
                  label={status?.linked ? 'Chat linked' : 'Chat not linked'}
                />
              </div>
              <p className="text-fg-subtle text-sm">
                Commands, alerts, and scheduled briefings in your own Telegram bot.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-fg-subtle hover:text-fg border-border/60 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconRefresh className="size-3.5" />
            )}
            Refresh
          </button>
        </div>

        <div className="mt-4">
          <Row
            icon={<IconPlugConnected className="size-4" />}
            label="Webhook"
            value={
              status?.webhook.configured
                ? `Configured${typeof status.webhook.pendingUpdateCount === 'number' ? ` · ${status.webhook.pendingUpdateCount} pending` : ''}`
                : 'Not configured — finish the guided setup'
            }
            action={
              <StatusPill
                ok={Boolean(status?.webhook.configured)}
                label={status?.webhook.configured ? 'Ready' : 'Setup'}
              />
            }
          />
          <Row
            icon={<IconMessageCircle className="size-4" />}
            label="Linked chat"
            value={
              status?.linked
                ? `${status.linked.chatId}${status.linked.linkedAt ? ` · since ${new Date(status.linked.linkedAt).toLocaleDateString()}` : ''}`
                : 'No chat linked yet'
            }
            action={
              status?.linked ? (
                <button
                  type="button"
                  onClick={() =>
                    void run('unlink', async () => {
                      await pluginFetch('/unlink', { method: 'POST', body: '{}' });
                    })
                  }
                  disabled={busy !== null}
                  className="text-fg-subtle hover:text-danger inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {busy === 'unlink' ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconUnlink className="size-3.5" />
                  )}
                  Unlink
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
              <a
                href="/settings/plugins"
                className="text-brand text-xs font-semibold hover:underline"
              >
                Change
              </a>
            }
          />
          <Row
            icon={<IconSend className="size-4" />}
            label="Alert notifications"
            value={
              status?.settings.alertsEnabled ? 'On — Telegram alerts are delivered here' : 'Muted'
            }
            action={
              status?.linked ? (
                <button
                  type="button"
                  onClick={() =>
                    void run('test', async () => {
                      await pluginFetch('/test-message', { method: 'POST', body: '{}' });
                    })
                  }
                  disabled={busy !== null}
                  className="border-border/60 text-fg-muted hover:text-fg inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {busy === 'test' ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconSend className="size-3.5" />
                  )}
                  Test
                </button>
              ) : null
            }
          />
        </div>

        {status?.webhook.lastErrorMessage ? (
          <p className="text-warn mt-3 text-xs">
            Telegram reports: {status.webhook.lastErrorMessage}
          </p>
        ) : null}
        {status?.settings.lastError ? (
          <p className="text-warn mt-3 text-xs">Last setup error: {status.settings.lastError}</p>
        ) : null}
      </section>

      <section className="surface-panel rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-fg text-sm font-semibold">Open your bot</h3>
            <p className="text-fg-subtle text-xs">
              Send /help to see commands, or /briefing to get a market summary now.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {botUrl ? (
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110"
              >
                <IconBrandTelegram className="size-4" />
                Open in Telegram
                <IconExternalLink className="size-3.5" />
              </a>
            ) : (
              <a
                href="/settings/plugins"
                className="bg-brand inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110"
              >
                Finish setup
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
        <h3 className="text-fg text-sm font-semibold">Command reference</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ['/price XAUUSD', 'Live bid / ask'],
            ['/analyze XAUUSD full', '4-desk AI analysis'],
            ['/ask <question>', 'Free-form market question'],
            ['/committee XAUUSD', 'Full team debate'],
            ['/news', 'Latest headlines'],
            ['/calendar', 'Upcoming events'],
            ['/positions', 'Open positions & P&L'],
            ['/alert XAUUSD > 2700', 'Create a price alert'],
            ['/briefing', 'Send the briefing now'],
            ['/mute /unmute', 'Pause alert notifications'],
          ].map(([command, description]) => (
            <div
              key={command}
              className="border-border/50 bg-bg-elev-1/40 flex flex-col gap-0.5 rounded-md border p-2.5"
            >
              <code className="text-fg font-mono text-xs">{command}</code>
              <span className="text-fg-subtle text-[11px]">{description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
