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
import type { PluginDashboardWidgetProps } from '@kestrel/plugin-sdk/ui';
import { IconBrandTelegram, IconExternalLink } from '@tabler/icons-react';

/**
 * Settings-only widget: it never receives secrets (the shell masks them).
 * The full connection state lives on /plugins/telegram-bot.
 */
export function TelegramStatusWidget({ settings }: PluginDashboardWidgetProps) {
  const botUsername = typeof settings['botUsername'] === 'string' ? settings['botUsername'] : null;
  const linked = typeof settings['linkedChatId'] === 'string';
  const briefing = settings['briefingEnabled'] === true;
  const alerts = settings['alertsEnabled'] !== false;

  return (
    <div className="surface-panel flex h-full flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-md">
            <IconBrandTelegram className="size-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-fg text-sm font-semibold">Telegram Copilot</span>
            <span className="text-fg-subtle text-[11px]">
              {botUsername ? `@${botUsername}` : 'Not configured'}
            </span>
          </div>
        </div>
        <span
          className={
            linked
              ? 'bg-success/10 text-success rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase'
              : 'bg-warn/10 text-warn rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase'
          }
        >
          {linked ? 'Linked' : 'Unlinked'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-bg-elev-1/50 rounded-md p-2">
          <dt className="text-fg-subtle">Alerts</dt>
          <dd className="text-fg font-mono font-semibold">{alerts ? 'On' : 'Muted'}</dd>
        </div>
        <div className="bg-bg-elev-1/50 rounded-md p-2">
          <dt className="text-fg-subtle">Briefing</dt>
          <dd className="text-fg font-mono font-semibold">{briefing ? 'On' : 'Off'}</dd>
        </div>
      </dl>

      <a
        href="/plugins/telegram-bot"
        className="text-brand mt-auto inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
      >
        Open Telegram console
        <IconExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
