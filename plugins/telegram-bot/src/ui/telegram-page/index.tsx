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
import { IconAlertTriangle } from '@tabler/icons-react';

import { BotActions } from './bot-actions';
import { CommandReference } from './command-reference';
import { StatusPanel } from './status-panel';
import { useTelegramPage } from './use-telegram-page';

export function TelegramPage() {
  const { status, loading, busy, error, load, unlink, sendTest } = useTelegramPage();

  const botUrl = status?.botUsername ? `https://t.me/${status.botUsername}` : null;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <StatusPanel
        status={status}
        loading={loading}
        busy={busy}
        onRefresh={() => void load()}
        onUnlink={() => void unlink()}
        onTest={() => void sendTest()}
      />

      <BotActions botUrl={botUrl} />

      <CommandReference />
    </div>
  );
}
