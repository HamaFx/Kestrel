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
import { IconBrandTelegram, IconExternalLink } from '@tabler/icons-react';
import Link from 'next/link';

export function BotActions({ botUrl }: { botUrl: string | null }) {
  return (
    <section data-slot="frame" className={PLUGIN_UI_CLASSES.frame}>
      <div data-slot="frame-header" className={PLUGIN_UI_CLASSES.frameHeader}>
        <span data-slot="frame-title" className={PLUGIN_UI_CLASSES.frameTitle}>
          Bot Gateway
        </span>
      </div>
      <div
        data-slot="frame-panel"
        className={`${PLUGIN_UI_CLASSES.framePanel} flex flex-wrap items-center justify-between gap-3`}
      >
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
              className={PLUGIN_UI_CLASSES.buttonPrimary}
            >
              <IconBrandTelegram className="size-4" />
              Open in Telegram
              <IconExternalLink className="size-3.5" />
            </a>
          ) : (
            <Link href="/settings/plugins" className={PLUGIN_UI_CLASSES.buttonPrimary}>
              Finish setup
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
