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
import { DEFAULT_WATCHLIST_SYMBOLS, type Symbol } from '@kestrel/shared';
import {
  IconAdjustmentsHorizontal,
  IconBolt,
  IconClock,
  IconTrendingUp,
} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';

import { RowDivider } from '../../row-divider';
import { SettingsRow } from '../../settings-row';
import { usePreferences } from './use-preferences';

export function PreferencesCard({
  watchlist = [...DEFAULT_WATCHLIST_SYMBOLS],
  initialPrefs,
}: {
  watchlist?: string[];
  initialPrefs?: {
    defaultSymbol?: string | null;
    timeFormat?: string | null;
    reduceMotion?: boolean | null;
  };
}) {
  const { prefs, hydrated, syncToDb } = usePreferences({ watchlist, initialPrefs });

  return (
    <section
      aria-labelledby="prefs-heading"
      className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="text-warn flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <IconAdjustmentsHorizontal className="size-4" />
          </div>
          <div>
            <h2 id="prefs-heading" className="text-fg text-sm font-semibold tracking-tight">
              Interface & Behavior
            </h2>
            <p className="text-fg-subtle text-xs">
              Default instrument, timestamps, and motion controls
            </p>
          </div>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase">
          Cloud Synced
        </span>
      </header>

      <SettingsRow
        icon={<IconTrendingUp className="size-4" />}
        label="Default symbol"
        description="Used when /chart loads without a symbol query"
        stack
        action={
          <Segmented<Symbol>
            value={prefs.defaultSymbol}
            onChange={(s) => syncToDb('defaultSymbol', s)}
            role="radiogroup"
            variant="solid"
            size="sm"
            options={watchlist.map((s) => ({ value: s, label: s.replace('USD', '') }))}
          />
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<IconClock className="size-4" />}
        label="Time format"
        description="Affects timestamps in news and the calendar"
        stack
        action={
          <Segmented<'12h' | '24h'>
            value={prefs.timeFormat}
            onChange={(t) => syncToDb('timeFormat', t)}
            role="radiogroup"
            variant="solid"
            size="sm"
            options={[
              { value: '12h', label: '12h' },
              { value: '24h', label: '24h' },
            ]}
          />
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<IconBolt className="size-4" />}
        label="Reduced motion"
        description="Force-disable animations regardless of system preference"
        action={
          <Switch
            checked={prefs.reduceMotion}
            onCheckedChange={(v) => {
              syncToDb('reduceMotion', v);
              if (hydrated) {
                toast.success(v ? 'Motion reduced' : 'Motion restored');
              }
            }}
            srLabel="Reduce motion"
          />
        }
      />
    </section>
  );
}
