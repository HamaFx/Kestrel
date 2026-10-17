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
import { useCallback, useState } from 'react';

import { updateLocaleAction } from '../../actions';
import { SettingsRow } from '../settings-row';

const LOCALES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
  { value: 'ar-AE', label: 'العربية' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'ja', label: '日本語' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
];

export function AppearanceCard({ initialLocale }: { initialLocale?: string }) {
  const [locale, setLocale] = useState(initialLocale ?? 'en');

  const handleLocaleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocale(e.target.value);
    updateLocaleAction(e.target.value);
  }, []);

  return (
    <section
      className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
      aria-labelledby="appearance-heading"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-cyan-400">
            <IconPalette className="size-4" />
          </div>
          <div>
            <h2 id="appearance-heading" className="text-fg text-sm font-semibold tracking-tight">
              Theme & Regional
            </h2>
            <p className="text-fg-subtle text-xs">Visual skin, language, and formatting conventions</p>
          </div>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase">
          Client UI
        </span>
      </div>
      <SettingsRow
        label="Locale"
        description="Language and date/number formatting"
        action={
          <select
            value={locale}
            onChange={handleLocaleChange}
            aria-label="Locale"
            className="border-white/10 bg-bg-elev-2 text-fg focus:border-cyan-500/50 focus:ring-cyan-500/20 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none transition-colors"
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        }
      />
      <div className="mt-1">
        <SettingsRow
          label="Color Scheme"
          description="Kestrel is tuned for dark cyber-industrial trading desks. Light mode is coming in a future update."
          action={
            <span className="surface-chip text-fg-subtle inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-mono font-medium">
              <IconMoon className="size-3.5 text-cyan-400" />
              Dark (Standard)
            </span>
          }
        />
      </div>
    </section>
  );
}

