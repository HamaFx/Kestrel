'use client';

// SPDX-License-Identifier: Apache-2.0

// Action row for future events: Ask AI deep link plus the local "Remind me"
// button (Notifications API, one-shot 5-minute reminder).
import type { EconomicEvent } from '@kestrel/shared';
import { IconBell, IconBolt } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/formatters/cn';

import { timeLabel } from './event-time';

const reminderSet = new Set<string>();

export function EventActions({ event }: { event: EconomicEvent }) {
  const askPrompt = encodeURIComponent(
    `What does ${event.title} (${event.currency ?? event.country}) at ${new Date(event.date).toUTCString()} usually mean for ${event.currency ?? 'USD'} and gold?`,
  );

  return (
    <div
      className={cn(
        'border-border/70 flex items-center justify-between gap-2 border-t px-3.5 py-2',
        'bg-bg-elev-1/60 transition-colors duration-150',
        'hover:bg-bg-elev-2/60',
      )}
    >
      <Link
        href={`/chat?prompt=${askPrompt}`}
        className="surface-chip bg-bg-elev-2 text-fg-muted hover:text-fg tactile-press border-edge/60 inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-medium shadow-xs transition-all active:translate-y-[0.5px]"
      >
        <IconBolt className="size-3.5" />
        Ask AI
      </Link>
      <RemindButton event={event} />
    </div>
  );
}

function RemindButton({ event }: { event: EconomicEvent }) {
  const [armed, setArmed] = useState(() => reminderSet.has(`cal-${event.id}`));

  async function arm() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Notifications unsupported on this device');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      toast.error('Notifications denied', {
        description: 'Enable notifications in your browser settings to set reminders.',
      });
      return;
    }

    const fireAt = event.date - 5 * 60_000;
    const ms = fireAt - Date.now();
    if (ms <= 0) {
      toast.error('Too close to the event for a 5-minute reminder');
      return;
    }
    setArmed(true);
    reminderSet.add(`cal-${event.id}`);
    toast.success('Reminder set', {
      description: `5 minutes before ${event.title}`,
    });
    window.setTimeout(() => {
      try {
        new Notification(event.title, {
          body: `${event.country} · ${timeLabel(new Date(event.date))} — in 5 minutes`,
          icon: '/icons/icon-192.png',
          tag: `cal-${event.id}`,
        });
      } catch {
        /* tab gone */
      }
    }, ms);
  }

  return (
    <button
      type="button"
      onClick={arm}
      disabled={armed}
      aria-pressed={armed}
      className={cn(
        'text-body-sm tactile-press pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 py-2 font-medium transition-colors active:translate-y-[0.5px]',
        armed ? 'text-fg bg-bg-elev-2' : 'text-fg-muted hover:text-fg bg-bg-elev-2',
      )}
    >
      <IconBell className={cn('size-3.5', armed && 'fill-current')} />
      {armed ? 'Reminded' : 'Remind me'}
    </button>
  );
}
