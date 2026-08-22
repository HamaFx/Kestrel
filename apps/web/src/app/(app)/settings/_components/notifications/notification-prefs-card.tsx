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
import { IconBell, IconDeviceMobile, IconMail } from '@tabler/icons-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';

import { updateNotificationPrefsAction } from '../../actions';

type EventType = 'alerts' | 'briefings' | 'weekly_review' | 'usage_warnings';
type Channel = 'email' | 'push' | 'telegram';

type PrefsMatrix = Record<EventType, Record<Channel, boolean>>;

const EVENT_LABELS: Record<EventType, string> = {
  alerts: 'Price alerts',
  briefings: 'Market briefings',
  weekly_review: 'Weekly review',
  usage_warnings: 'Usage warnings',
};

const CHANNELS: { key: Channel; icon: typeof IconBell; label: string }[] = [
  { key: 'email', icon: IconMail, label: 'Email' },
  { key: 'push', icon: IconBell, label: 'Push' },
  { key: 'telegram', icon: IconDeviceMobile, label: 'Telegram' },
];

const DEFAULT_PREFS: PrefsMatrix = {
  alerts: { email: true, push: true, telegram: false },
  briefings: { email: false, push: true, telegram: false },
  weekly_review: { email: true, push: false, telegram: false },
  usage_warnings: { email: true, push: true, telegram: true },
};

export function NotificationPrefsCard({
  initialPrefs,
}: {
  initialPrefs?: Record<string, Record<string, boolean>> | null;
}) {
  const [prefs, setPrefs] = useState<PrefsMatrix>(() => {
    if (initialPrefs) {
      return {
        ...DEFAULT_PREFS,
        ...Object.fromEntries(
          (Object.keys(DEFAULT_PREFS) as EventType[]).map((event) => [
            event,
            { ...DEFAULT_PREFS[event], ...(initialPrefs[event] ?? {}) },
          ]),
        ),
      };
    }
    return DEFAULT_PREFS;
  });

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const toggle = useCallback((event: EventType, channel: Channel, value: boolean) => {
    const prev = prefsRef.current;
    const next: PrefsMatrix = {
      ...prev,
      [event]: { ...prev[event], [channel]: value },
    };
    setPrefs(next);
    updateNotificationPrefsAction(next).then((result) => {
      if (!result.ok) {
        setPrefs(prev);
        toast.error('Failed to update notification preference');
      }
    });
  }, []);

  return (
    <section
      className="border-border bg-bg-elev-1 flex flex-col gap-1 rounded-sm border p-4"
      aria-labelledby="notification-prefs-heading"
    >
      <div className="flex items-center gap-3 pb-2">
        <h2
          id="notification-prefs-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          Notification preferences
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="text-fg-muted py-2 pr-4 text-left font-medium">Event type</th>
              {CHANNELS.map((ch) => (
                <th
                  key={ch.key}
                  className="text-caption text-fg-muted px-3 py-2 text-center font-semibold tracking-wider uppercase"
                >
                  <ch.icon className="mx-auto size-4" aria-hidden="true" />
                  <span className="text-caption mt-0.5 block">{ch.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(DEFAULT_PREFS) as EventType[]).map((event) => (
              <tr key={event} className="border-border/50 border-b last:border-0">
                <td className="text-fg py-3 pr-4">{EVENT_LABELS[event]}</td>
                {CHANNELS.map((ch) => (
                  <td key={ch.key} className="px-3 py-3 text-center">
                    <Switch
                      checked={prefs[event]?.[ch.key] ?? false}
                      onCheckedChange={(v) => toggle(event, ch.key, v)}
                      srLabel={`${EVENT_LABELS[event]} — ${ch.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
