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
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconDatabase,
  IconLoader2,
} from '@tabler/icons-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { apiMutate } from '@/lib/api-client';

import { updateMarketDataProviderAction } from '../../actions';

interface MarketDataConfigProps {
  initialProvider: string;
  finnhubKeySet: boolean;
}

type TestState =
  { kind: 'idle' } | { kind: 'pending' } | { kind: 'ok' } | { kind: 'err'; message: string };

export function MarketDataConfig({ initialProvider, finnhubKeySet }: MarketDataConfigProps) {
  const [selected, setSelected] = useState(initialProvider);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [isTesting, startTestTransition] = useTransition();

  const [state, action, pending] = useActionState(
    async (prevState: { error: string; ok: boolean }, formData: FormData) => {
      const res = await updateMarketDataProviderAction(formData);
      return {
        error: 'error' in res ? (res.error ?? '') : '',
        ok: res.ok,
      };
    },
    { error: '', ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      toast.success('Market data provider updated successfully');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  function handleTest() {
    setTest({ kind: 'pending' });
    startTestTransition(async () => {
      try {
        const data = await apiMutate<{ ok: boolean; error?: string }>(
          '/api/settings/test-market-provider',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: selected }),
          },
        );
        if (!data.ok) {
          setTest({ kind: 'err', message: data.error ?? 'Provider test failed' });
        } else {
          setTest({ kind: 'ok' });
        }
      } catch (err) {
        setTest({
          kind: 'err',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  const providersList = [
    {
      id: 'biquote',
      name: 'BiQuote REST',
      description: 'Free, fallback API. Unauthenticated, standard 10 req/min throttle limit.',
      requiresKey: false,
    },
    {
      id: 'finnhub',
      name: 'Finnhub REST',
      description: 'Supports weekly candles and robust historical feeds. Requires Finnhub API key.',
      requiresKey: true,
      warn: !finnhubKeySet && selected === 'finnhub',
    },
    {
      id: 'live-ticks',
      name: 'Live Ticks (Worker)',
      description: 'Worker-maintained low-latency cache. Reads directly from local database.',
      requiresKey: false,
    },
  ];

  return (
    <form
      action={action}
      className="border-border bg-bg-elev-1 flex flex-col gap-5 rounded-sm border p-5 shadow-sm"
    >
      <header className="border-border flex items-center gap-3 border-b pb-3">
        <IconDatabase className="text-fg size-5 shrink-0" />
        <div>
          <h2 className="text-fg text-sm font-semibold">Market Data Provider</h2>
          <p className="text-caption text-fg-subtle mt-0.5">
            Select the source used for charts, indicators, and real-time prices.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {providersList.map((p) => (
          <label
            key={p.id}
            className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 transition-all select-none ${
              selected === p.id
                ? 'border-border bg-bg-elev-1'
                : 'border-border bg-bg-elev-2/40 hover:bg-bg-elev-2'
            }`}
          >
            <input
              type="radio"
              name="marketDataProvider"
              value={p.id}
              checked={selected === p.id}
              onChange={() => {
                setSelected(p.id);
                setTest({ kind: 'idle' });
              }}
              className="accent-brand mt-0.5 size-4 cursor-pointer"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-fg text-xs font-semibold">{p.name}</span>
              <span className="text-fg-subtle text-xs leading-normal">{p.description}</span>
              {p.warn && (
                <span className="text-warn mt-1 inline-flex items-center gap-1 text-xs font-semibold">
                  <IconAlertTriangle className="size-3.5 shrink-0" />
                  <span>Note: Finnhub API key is not set above. Please add it to enable this provider.</span>
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {test.kind === 'err' && (
        <div className="text-danger flex items-start gap-2 text-xs">
          <IconCircleX className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{test.message}</span>
        </div>
      )}
      {test.kind === 'ok' && (
        <div className="text-success flex items-center gap-2 text-xs">
          <IconCircleCheck className="size-3.5 shrink-0" />
          <span>Connection test successful! Provider is online.</span>
        </div>
      )}

      <div className="border-border flex items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleTest}
          disabled={isTesting || (selected === 'finnhub' && !finnhubKeySet)}
          loading={isTesting}
        >
          {isTesting ? (
            <>
              <IconLoader2 className="size-3 animate-spin" />
              Testing…
            </>
          ) : (
            'Test Connectivity'
          )}
        </Button>

        <Button type="submit" loading={pending} className="min-w-[120px]" size="sm">
          Save Provider
        </Button>
      </div>
    </form>
  );
}
