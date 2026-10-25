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
import { IconBrandTelegram, IconExternalLink } from '@tabler/icons-react';

export function BotActions({ botUrl }: { botUrl: string | null }) {
  return (
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
  );
}
