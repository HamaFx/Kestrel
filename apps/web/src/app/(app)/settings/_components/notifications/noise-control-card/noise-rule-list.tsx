'use client';

// SPDX-License-Identifier: Apache-2.0

// Editable noise-control rules: smart digest, quiet hours, minimum severity,
// quiet-hours severity, cooldown, and dedup window.
import type { NoiseConfig } from '@kestrel/shared';
import {
  IconBell,
  IconBolt,
  IconClock,
  IconDeviceMobile,
  IconFilter,
  IconInfoCircle,
  IconMail,
  IconMoon,
} from '@tabler/icons-react';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/formatters/cn';

import { SEVERITY_OPTIONS } from './severity-options';

export function NoiseRuleList({
  config,
  update,
}: {
  config: NoiseConfig;
  update: (updates: Partial<NoiseConfig>) => void;
}) {
  return (
    <>
      {/* Smart Alert Digest */}
      <div className="surface-well flex flex-col gap-3 rounded-xl border border-white/5 p-4 shadow-inner">
        <div className="flex items-start gap-3">
          <div className="surface-chip text-fg rounded-lg border border-white/5 p-2 shadow-xs">
            <IconMail className="size-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-fg text-sm font-semibold">Smart alert digest</h3>
            <p className="text-fg-subtle mt-1 text-xs">
              When daily digest is on, non-critical alerts are batched into a single summary instead
              of interrupting you one-by-one.
            </p>
          </div>
          <Switch
            checked={config.dailyDigestMode}
            onCheckedChange={(v) => update({ dailyDigestMode: v })}
            srLabel="Toggle daily digest mode"
          />
        </div>
        <div className="text-fg-subtle grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="flex items-center gap-1.5">
            <IconInfoCircle className="size-3.5" />
            <span>Info & warning batched</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IconDeviceMobile className="size-3.5" />
            <span>Critical still instant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IconBell className="size-3.5" />
            <span>Sent once per day</span>
          </div>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconMoon className="text-fg-muted size-4" />
          <span className="text-fg text-sm font-medium">Quiet hours</span>
          <Switch
            checked={config.quietHours !== null}
            onCheckedChange={(enabled) =>
              update({
                quietHours: enabled ? { start: '22:00', end: '07:00' } : null,
              })
            }
            srLabel="Toggle quiet hours"
          />
        </div>
        {config.quietHours && (
          <div className="flex items-center gap-2 pl-6">
            <IconClock className="text-fg-muted size-3.5" />
            <input
              type="time"
              value={config.quietHours.start}
              onChange={(e) =>
                update({
                  quietHours: { ...config.quietHours!, start: e.target.value },
                })
              }
              aria-label="Quiet hours start time"
              className="border-border bg-bg-elev-1 text-fg rounded-sm border px-2 py-1 text-sm"
            />
            <span className="text-fg-muted text-sm">to</span>
            <input
              type="time"
              value={config.quietHours.end}
              onChange={(e) =>
                update({
                  quietHours: { ...config.quietHours!, end: e.target.value },
                })
              }
              aria-label="Quiet hours end time"
              className="border-border bg-bg-elev-1 text-fg rounded-sm border px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>

      {/* Min Severity */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconFilter className="text-fg-muted size-4" />
          <span className="text-fg text-sm font-medium">Minimum severity</span>
        </div>
        <div className="flex gap-2 pl-6">
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ minSeverity: opt.value })}
              className={cn(
                'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
                config.minSeverity === opt.value
                  ? 'bg-fg text-white'
                  : 'bg-bg-elev-2 text-fg-muted hover:text-fg',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Min Severity During Quiet Hours */}
      {config.quietHours && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <IconMoon className="text-fg-muted size-4" />
            <span className="text-fg text-sm font-medium">Min severity during quiet hours</span>
          </div>
          <div className="flex gap-2 pl-6">
            {SEVERITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update({ minSeverityDuringQuietHours: opt.value })}
                className={cn(
                  'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
                  config.minSeverityDuringQuietHours === opt.value
                    ? 'bg-fg text-white'
                    : 'bg-bg-elev-2 text-fg-muted hover:text-fg',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cooldown */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconBolt className="text-fg-muted size-4" />
          <span className="text-fg text-sm font-medium">Cooldown (seconds)</span>
        </div>
        <input
          type="number"
          min={0}
          max={86400}
          value={config.cooldownSeconds}
          onChange={(e) => update({ cooldownSeconds: Number(e.target.value) })}
          aria-label="Cooldown in seconds"
          className="border-border bg-bg-elev-1 text-fg ml-6 w-32 rounded-sm border px-2 py-1 text-sm"
        />
      </div>

      {/* Dedup TTL */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconBell className="text-fg-muted size-4" />
          <span className="text-fg text-sm font-medium">Dedup window (seconds)</span>
        </div>
        <input
          type="number"
          min={0}
          max={86400}
          value={config.dedupTtlSeconds}
          onChange={(e) => update({ dedupTtlSeconds: Number(e.target.value) })}
          aria-label="Dedup window in seconds"
          className="border-border bg-bg-elev-1 text-fg ml-6 w-32 rounded-sm border px-2 py-1 text-sm"
        />
      </div>
    </>
  );
}
