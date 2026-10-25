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
import type { Account, Side } from './use-place-order';

export function OrderPreview({
  selected,
  side,
  onSideChange,
}: {
  selected: Account | undefined;
  side: Side;
  onSideChange: (side: Side) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-fg text-sm font-semibold">Place a paper order</h2>
        <p className="text-fg-subtle text-[11px]">
          {selected
            ? selected.mode === 'confirm'
              ? 'Personal Demo — this order needs your approval in chat when placed by the agent.'
              : 'Agent Sandbox — orders fill without approval.'
            : 'Virtual money only.'}
        </p>
      </div>
      <div className="border-border/60 flex rounded-md border p-0.5">
        {(['buy', 'sell'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onSideChange(value)}
            className={
              side === value
                ? value === 'buy'
                  ? 'bg-bull/15 text-bull rounded px-3 py-1 text-xs font-bold uppercase'
                  : 'bg-bear/15 text-bear rounded px-3 py-1 text-xs font-bold uppercase'
                : 'text-fg-subtle rounded px-3 py-1 text-xs font-bold uppercase'
            }
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
