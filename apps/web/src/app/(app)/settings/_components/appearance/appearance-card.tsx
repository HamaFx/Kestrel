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
import { IconMoon, IconPalette } from '@tabler/icons-react';

import { SettingsRow } from '../settings-row';

export function AppearanceCard() {
  return (
    <section
      className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
      aria-labelledby="appearance-heading"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="text-brand flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <IconPalette className="size-4" />
          </div>
          <div>
            <h2 id="appearance-heading" className="text-fg text-sm font-semibold tracking-tight">
              Theme & Regional
            </h2>
            <p className="text-fg-subtle text-xs">
              Visual skin, language, and formatting conventions
            </p>
          </div>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase">
          Client UI
        </span>
      </div>
      <SettingsRow
        label="Locale"
        description="Regional date/time formatting follows your browser locale and the 12h/24h preference below."
        action={
          <span className="surface-chip text-fg-muted border-border/60 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-xs font-medium">
            English (US · Auto)
          </span>
        }
      />
      <div className="mt-1">
        <SettingsRow
          label="Color Scheme"
          description="Kestrel is tuned for dark cyber-industrial trading desks. Light mode is coming in a future update."
          action={
            <span className="surface-chip text-fg-subtle inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 font-mono text-xs font-medium">
              <IconMoon className="text-brand size-3.5" />
              Dark (Standard)
            </span>
          }
        />
      </div>
    </section>
  );
}
