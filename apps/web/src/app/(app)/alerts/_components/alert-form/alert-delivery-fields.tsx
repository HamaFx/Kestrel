'use client';

// SPDX-License-Identifier: Apache-2.0

// Delivery fields for the alert form: channels, note, and snooze window.
import { Input } from '@/components/ui/input';

import type { AlertFormController } from './use-alert-form';

export function AlertDeliveryFields({ controller }: { controller: AlertFormController }) {
  const {
    channels,
    setChannels,
    pluginChannels,
    touch,
    fieldErrors,
    note,
    setNote,
    snoozeHours,
    setSnoozeHours,
  } = controller;

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-fg-subtle text-body-sm tracking-wide uppercase">
          Delivery Methods
        </legend>
        <div className="flex gap-4">
          <label className="text-fg flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand size-4 cursor-pointer"
              checked={channels.includes('email')}
              onChange={(e) => {
                const c = 'email';
                setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c));
              }}
              onBlur={() => touch('channels')}
            />
            Email
          </label>
          <label className="text-fg flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand size-4 cursor-pointer"
              checked={channels.includes('telegram')}
              onChange={(e) => {
                const c = 'telegram';
                setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c));
              }}
              onBlur={() => touch('channels')}
            />
            Telegram
          </label>
          {pluginChannels.map((channel) => (
            <label
              key={channel.id}
              className="text-fg flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                className="accent-brand size-4 cursor-pointer"
                checked={channels.includes(channel.id)}
                onChange={(e) => {
                  setChannels(
                    e.target.checked
                      ? [...channels, channel.id]
                      : channels.filter((x) => x !== channel.id),
                  );
                }}
                onBlur={() => touch('channels')}
              />
              {channel.label}
            </label>
          ))}
        </div>
        {fieldErrors.channels ? (
          <p id="alert-channels-error" role="alert" className="text-danger text-xs">
            {fieldErrors.channels}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-body-sm tracking-wide uppercase" htmlFor="alert-note">
          Note (optional)
        </label>
        <Input
          id="alert-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => touch('note')}
          placeholder="Why am I watching this level?"
          maxLength={280}
          {...(fieldErrors.note ? { 'aria-describedby': 'alert-note-error' } : {})}
        />
        {fieldErrors.note ? (
          <p id="alert-note-error" role="alert" className="text-danger text-xs">
            {fieldErrors.note}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="text-fg-subtle text-body-sm tracking-wide uppercase"
          htmlFor="alert-snooze"
        >
          Re-arm after (hours, 0 = one-shot)
        </label>
        <Input
          id="alert-snooze"
          type="number"
          min={0}
          max={168}
          step={1}
          value={snoozeHours}
          onChange={(e) => setSnoozeHours(e.target.value)}
          placeholder="Leave empty for one-shot trigger"
        />
      </div>
    </>
  );
}
