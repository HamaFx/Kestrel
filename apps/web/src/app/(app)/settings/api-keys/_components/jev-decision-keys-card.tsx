// SPDX-License-Identifier: Apache-2.0

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

// Decision 4A — Jev Decision Model Keys card.
//
// Saves the System One decision-model keys through their own server action so
// chat-provider saves can never clear them. Inputs are boolean-seeded (the
// stored secret never crosses to the client); a stored key prefills the
// `***KEEP***` sentinel, an emptied field clears it.

import { IconSparkles } from '@tabler/icons-react';
import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { updateJevApiKeysAction, type SaveKeysResult } from '../../actions';
import { JEV_DECISION_KEY_KEEP, JEV_DECISION_KEYS } from './jev-decision-keys';

interface JevDecisionKeysCardProps {
  /** Whether a key is currently stored for each Jev provider. */
  initialKeys: { opencode: boolean; liquid: boolean; typesafe: boolean };
}

export function JevDecisionKeysCard({ initialKeys }: JevDecisionKeysCardProps) {
  const [state, formAction, isPending] = useActionState<SaveKeysResult, FormData>(
    updateJevApiKeysAction,
    { status: 'idle' },
  );
  const lastSeenAt = useRef<number | null>(null);

  useEffect(() => {
    if ('ok' in state && state.ok) {
      // Dedupe so React strict-mode re-renders do not toast twice.
      if (lastSeenAt.current !== state.data.at) {
        lastSeenAt.current = state.data.at;
        const changed = state.data.savedCount + state.data.clearedCount;
        if (changed === 0) {
          toast.success('Decision model keys unchanged');
        } else {
          const clearedSuffix =
            state.data.clearedCount > 0 ? `, cleared ${state.data.clearedCount}` : '';
          toast.success(`Saved ${state.data.savedCount} decision key(s)${clearedSuffix}`);
        }
      }
    } else if ('ok' in state) {
      toast.error(`Save failed: ${state.error}`);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="border-border bg-bg-elev-1 flex flex-col gap-5 rounded-sm border p-5 shadow-sm"
    >
      <header className="border-border flex items-center gap-3 border-b pb-3">
        <IconSparkles className="text-fg size-5 shrink-0" />
        <div>
          <h2 className="text-fg text-sm font-semibold">Decision Model Keys (Jev System One)</h2>
          <p className="text-caption text-fg-subtle mt-0.5">
            Optional. Powers 1-pass turn routing, packet calibration, tool pruning, and verifier
            verdicts. Separate from your chat LLM providers — saving one never clears the other.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {JEV_DECISION_KEYS.map((key) => {
          const isSet = initialKeys[key.id];
          return (
            <div key={key.id} className="flex flex-col gap-1.5">
              <label htmlFor={`jev-key-${key.id}`} className="text-fg text-xs font-semibold">
                {key.label}
              </label>
              <Input
                id={`jev-key-${key.id}`}
                name={key.id}
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                defaultValue={isSet ? JEV_DECISION_KEY_KEEP : ''}
                placeholder={
                  isSet ? 'Leave as ***KEEP*** to keep the stored key' : 'Paste the key to enable'
                }
              />
              <p className="text-caption text-fg-subtle">{key.description}</p>
            </div>
          );
        })}
      </div>

      <div className="border-border flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-caption text-fg-subtle">
          Empty a field and save to remove that decision key.
        </p>
        <Button type="submit" loading={isPending} size="sm" className="min-w-[150px]">
          Save Decision Keys
        </Button>
      </div>
    </form>
  );
}
