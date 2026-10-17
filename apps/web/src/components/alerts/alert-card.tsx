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

// SPDX-License-Identifier: Apache-2.0

import type { Symbol } from '@kestrel/shared';
import {
  IconBell,
  IconBellOff,
  IconBellRinging,
  IconCheck,
  IconMail,
  IconSend,
  IconTrash,
  IconVolumeOff,
} from '@tabler/icons-react';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

export interface AlertCardData {
  id: string;
  symbol: Symbol | string;
  ruleType: 'price' | 'indicator' | 'candle';
  condition: string;
  targetValue: number | string;
  active: boolean;
  firedAt?: number | null;
  createdAt: number;
  channels?: ('email' | 'telegram' | 'webhook')[];
  note?: string;
  muted?: boolean;
}

export interface AlertCardProps {
  alert: AlertCardData;
  onAcknowledge?: (id: string) => void;
  onMute?: (id: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

/**
 * AlertCard — Cyber-industrial neo-skeuomorphic card for price & indicator alerts.
 * Features 40px touch targets, tactile micro-press feedback, and accessible ARIA labels.
 */
export function AlertCard({
  alert,
  onAcknowledge,
  onMute,
  onDelete,
  className,
}: AlertCardProps) {
  const isTriggered = !!alert.firedAt;
  const isMuted = !!alert.muted;

  const StatusIcon = alert.active
    ? IconBell
    : isTriggered
      ? IconBellRinging
      : isMuted
        ? IconVolumeOff
        : IconBellOff;

  return (
    <article
      className={cn(
        'surface-panel border-border bg-surface-panel relative flex flex-col justify-between gap-3 overflow-hidden rounded-xl border p-4 shadow-sm transition-all duration-200',
        !alert.active && 'opacity-70 saturate-75',
        isTriggered && 'border-warn/40 shadow-[0_0_12px_rgba(245,158,11,0.1)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md border text-xs font-mono',
              alert.active
                ? 'border-brand/40 bg-brand/10 text-brand'
                : isTriggered
                  ? 'border-warn/40 bg-warn/10 text-warn'
                  : 'border-edge bg-surface-well text-fg-subtle',
            )}
          >
            <StatusIcon className="size-5" />
          </span>

          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="text-fg font-mono text-sm font-bold tracking-tight">
                {alert.symbol}
              </span>
              <span className="text-caption border-edge bg-surface-chip text-fg-muted rounded-md border px-2 py-0.5 font-mono uppercase">
                {alert.ruleType}
              </span>
            </div>
            <p className="text-fg-subtle mt-0.5 text-xs font-mono">
              {alert.condition} {alert.targetValue}
            </p>
            {alert.note && (
              <p className="text-fg-muted mt-1 text-xs">{alert.note}</p>
            )}
          </div>
        </div>

        {/* Action button cluster — 40px touch targets with tactile-press */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onAcknowledge && (
            <Tooltip label={isTriggered ? 'Acknowledge alert' : 'Re-arm alert'}>
              <button
                type="button"
                onClick={() => onAcknowledge(alert.id)}
                aria-label={`Acknowledge alert for ${alert.symbol}`}
                className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-md transition-colors tactile-press active:translate-y-[0.5px]"
              >
                <IconCheck className="size-4" />
              </button>
            </Tooltip>
          )}

          {onMute && (
            <Tooltip label={isMuted ? 'Unmute alert' : 'Mute alert'}>
              <button
                type="button"
                onClick={() => onMute(alert.id)}
                aria-label={`Mute alert for ${alert.symbol}`}
                className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-md transition-colors tactile-press active:translate-y-[0.5px]"
              >
                <IconVolumeOff className="size-4" />
              </button>
            </Tooltip>
          )}

          {onDelete && (
            <Tooltip label="Delete alert">
              <button
                type="button"
                onClick={() => onDelete(alert.id)}
                aria-label={`Delete alert for ${alert.symbol}`}
                className="text-danger/70 hover:text-danger hover:bg-danger/10 inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-md transition-colors tactile-press active:translate-y-[0.5px]"
              >
                <IconTrash className="size-4" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Channel indicators & Status line */}
      <div className="border-edge/60 flex items-center justify-between border-t pt-2 text-[11px] font-mono text-fg-subtle">
        <span>
          {isTriggered
            ? 'Triggered'
            : alert.active
              ? 'Monitoring active'
              : 'Paused'}
        </span>
        <div className="flex items-center gap-1.5">
          {alert.channels?.includes('email') && (
            <IconMail className="size-3.5 text-fg-subtle" aria-label="Email enabled" />
          )}
          {alert.channels?.includes('telegram') && (
            <IconSend className="size-3.5 text-fg-subtle" aria-label="Telegram enabled" />
          )}
        </div>
      </div>
    </article>
  );
}
