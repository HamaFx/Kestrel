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
      className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-4"
      aria-labelledby="appearance-heading"
    >
      <div className="flex items-center justify-between">
        <h2 id="appearance-heading" className="text-fg text-base font-semibold tracking-tight">
          Appearance
        </h2>
        <p className="text-fg-subtle text-caption tracking-wider uppercase">Locale</p>
      </div>
      <SettingsRow
        label="Locale"
        description="Language and date/number formatting"
        action={
          <select
            value={locale}
            onChange={handleLocaleChange}
            aria-label="Locale"
            className="border-border bg-bg-elev-2 text-fg focus:ring-fg rounded-sm border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        }
      />
      <div className="mt-2">
        <SettingsRow
          label="Theme"
          description="Kestrel is currently dark-only. A light theme may be offered in the future."
          action={
            <span className="border-border bg-bg-elev-2 text-fg-subtle inline-flex items-center rounded-sm border px-3 py-1.5 text-sm">
              Dark
            </span>
          }
        />
      </div>
    </section>
  );
}
