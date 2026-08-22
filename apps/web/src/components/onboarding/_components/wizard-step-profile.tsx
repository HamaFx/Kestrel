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

import { IconChevronRight } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface WizardStepProfileProps {
  name: string;
  setName: (value: string) => void;
  nameError: string | null;
  timezone: string;
  setTimezone: (value: string) => void;
  onNext: () => void;
}

export function WizardStepProfile({
  name,
  setName,
  nameError,
  timezone,
  setTimezone,
  onNext,
}: WizardStepProfileProps) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 flex flex-col gap-6">
      <div>
        <h2 className="text-fg mb-1 text-xl font-semibold">Let's get to know you</h2>
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
          placeholder="Satoshi Nakamoto"
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
      <div className="flex flex-col gap-2">
        <label className="text-fg text-sm font-medium" htmlFor="onboarding-timezone">
          Timezone
        </label>
        <select
          id="onboarding-timezone"
          className="border-border bg-bg-elev-1 text-fg focus:ring-fg h-11 w-full cursor-pointer rounded-sm border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {Intl.supportedValuesOf('timeZone').map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <Button className="w-full" onClick={onNext} disabled={!name.trim()}>
        Continue <IconChevronRight className="ml-2 size-4" />
      </Button>
    </div>
  );
}
