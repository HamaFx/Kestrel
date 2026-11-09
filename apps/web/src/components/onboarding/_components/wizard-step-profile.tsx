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

import { IconChevronRight, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface WizardStepProfileProps {
  name: string;
  setName: (value: string) => void;
  nameError: string | null;
  timezone: string;
  setTimezone: (value: string) => void;
  onNext: () => void;
}

const QUICK_TIMEZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'New York', value: 'America/New_York' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
] as const;

const ALL_TIMEZONES: readonly string[] = (() => {
  try {
    const list = Intl.supportedValuesOf('timeZone');
    return list.includes('UTC') ? list : ['UTC', ...list];
  } catch {
    return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'];
  }
})();

export function WizardStepProfile({
  name,
  setName,
  nameError,
  timezone,
  setTimezone,
  onNext,
}: WizardStepProfileProps) {
  const [tzQuery, setTzQuery] = useState('');

  useEffect(() => {
    if (!timezone) {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) setTimezone(detected);
      } catch {
        setTimezone('UTC');
      }
    }
  }, [timezone, setTimezone]);

  const filteredTimezones = useMemo(() => {
    const normalizedQuery = tzQuery.trim().toLowerCase().replaceAll('_', ' ');
    if (!normalizedQuery) return ALL_TIMEZONES;
    const matches = ALL_TIMEZONES.filter((tz) =>
      tz.toLowerCase().replaceAll('_', ' ').includes(normalizedQuery),
    );
    if (timezone && !matches.includes(timezone)) {
      return [timezone, ...matches];
    }
    return matches;
  }, [tzQuery, timezone]);

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 flex flex-col gap-6">
      <div>
        <h2 className="text-fg mb-1 text-xl font-semibold">Let&apos;s get to know you</h2>
        <p className="text-fg-subtle text-sm">Profile settings for your AI trading workspace.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-fg text-sm font-medium" htmlFor="onboarding-display-name">
          Display Name
        </label>
        <Input
          id="onboarding-display-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Alex Morgan"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'onboarding-name-error' : undefined}
          autoFocus
        />
        {nameError && (
          <p id="onboarding-name-error" role="alert" className="text-danger text-xs">
            {nameError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-fg text-sm font-medium" htmlFor="onboarding-timezone">
            Timezone
          </label>
          <span className="text-fg-subtle font-mono text-xs">{timezone || 'UTC'}</span>
        </div>

        <div className="relative">
          <IconSearch
            aria-hidden="true"
            className="text-fg-subtle pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
          />
          <Input
            id="onboarding-timezone-search"
            type="search"
            value={tzQuery}
            onChange={(e) => {
              const nextQuery = e.target.value;
              setTzQuery(nextQuery);
              const normalized = nextQuery.trim().toLowerCase().replaceAll('_', ' ');
              if (normalized) {
                const firstMatch = ALL_TIMEZONES.find((tz) =>
                  tz.toLowerCase().replaceAll('_', ' ').includes(normalized),
                );
                if (firstMatch) setTimezone(firstMatch);
              }
            }}
            placeholder="Search timezone (e.g. New York, London, Tokyo, UTC)…"
            aria-label="Filter timezones"
            className="h-10 rounded-lg pl-9 text-sm"
          />
        </div>

        <Select
          id="onboarding-timezone"
          className="rounded-lg"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {filteredTimezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-fg-subtle mr-1 text-xs">Major sessions:</span>
          {QUICK_TIMEZONES.map((preset) => {
            const active = timezone === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  setTimezone(preset.value);
                  setTzQuery('');
                }}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors ${
                  active
                    ? 'border-brand/50 bg-brand/15 text-brand font-semibold'
                    : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
      <Button className="w-full rounded-lg" onClick={onNext} disabled={!name.trim()}>
        Continue <IconChevronRight className="ml-2 size-4" />
      </Button>
    </div>
  );
}
