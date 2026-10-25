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
import { IconAlertTriangle, IconLoader2, IconSend } from '@tabler/icons-react';

import { OrderFields } from './order-fields';
import { OrderPreview } from './order-preview';
import { usePlaceOrder, type Account } from './use-place-order';

export function PlaceOrderForm({
  accounts,
  onPlaced,
}: {
  accounts: readonly Account[];
  onPlaced: () => void;
}) {
  const { state, selected, setField, submit } = usePlaceOrder({ accounts, onPlaced });

  return (
    <form
      onSubmit={submit}
      className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4"
    >
      <OrderPreview
        selected={selected}
        side={state.side}
        onSideChange={(side) => setField({ side })}
      />

      <OrderFields accounts={accounts} state={state} setField={setField} />

      {state.error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{state.error}</span>
        </div>
      ) : null}
      {state.message ? (
        <div className="border-success/30 bg-success/5 text-success rounded-lg border p-3 text-xs">
          {state.message}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={state.busy}
          className="bg-brand inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {state.busy ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconSend className="size-4" />
          )}
          Place paper order
        </button>
      </div>
    </form>
  );
}
