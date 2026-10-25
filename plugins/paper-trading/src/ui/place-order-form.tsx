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
import { useState } from 'react';
import type { z } from 'zod';

import type { AccountSchema } from '../schemas';
import { errorMessage, pluginFetch } from './api';

type Account = z.infer<typeof AccountSchema>;
type Side = 'buy' | 'sell';
type OrderType = 'market' | 'limit' | 'stop';

const inputClass =
  'border-border/60 bg-bg-elev-1 text-fg placeholder:text-fg-subtle focus:border-brand/60 h-9 rounded-md border px-2.5 font-mono text-xs outline-none';

const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'BTCUSDT', 'ETHUSDT'];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="text-fg-subtle text-[10px]">{hint}</span> : null}
    </label>
  );
}

export function PlaceOrderForm({
  accounts,
  onPlaced,
}: {
  accounts: readonly Account[];
  onPlaced: () => void;
}) {
  const [accountRef, setAccountRef] = useState('personal');
  const [symbol, setSymbol] = useState('XAUUSD');
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('');
  const [riskPct, setRiskPct] = useState('');
  const [price, setPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [trailingStop, setTrailingStop] = useState('');
  const [timeInForce, setTimeInForce] = useState<'gtc' | 'day'>('gtc');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = accounts.find(
    (account) => account.id === accountRef || account.mode === accountRef,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await pluginFetch<{ ok: boolean; message: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          account: accountRef,
          symbol,
          side,
          type,
          ...(quantity ? { quantity: Number(quantity) } : {}),
          ...(riskPct ? { riskPct: Number(riskPct) } : {}),
          ...(type !== 'market' && price ? { price: Number(price) } : {}),
          ...(stopLoss ? { stopLoss: Number(stopLoss) } : {}),
          ...(takeProfit ? { takeProfit: Number(takeProfit) } : {}),
          ...(trailingStop ? { trailingStop: Number(trailingStop) } : {}),
          timeInForce,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      setMessage(response.message);
      setQuantity('');
      setRiskPct('');
      setPrice('');
      setStopLoss('');
      setTakeProfit('');
      setTrailingStop('');
      setNotes('');
      onPlaced();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4"
    >
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
              onClick={() => setSide(value)}
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Account">
          <select
            value={accountRef}
            onChange={(event) => setAccountRef(event.target.value)}
            className={inputClass}
          >
            <option value="personal">Personal Demo</option>
            <option value="sandbox">AI Agent Sandbox</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Symbol">
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            list="paper-symbols"
            className={inputClass}
          />
          <datalist id="paper-symbols">
            {SYMBOLS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as OrderType)}
            className={inputClass}
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
          </select>
        </Field>
        <Field label="Time in force">
          <select
            value={timeInForce}
            onChange={(event) => setTimeInForce(event.target.value === 'day' ? 'day' : 'gtc')}
            className={inputClass}
          >
            <option value="gtc">GTC</option>
            <option value="day">Day</option>
          </select>
        </Field>
        <Field label="Quantity (lots/coins)" hint="Omit to size from risk">
          <input
            type="number"
            min={0}
            step={0.01}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="Auto"
            className={inputClass}
          />
        </Field>
        <Field label="Risk %" hint="Blank = account default">
          <input
            type="number"
            min={0.01}
            max={20}
            step={0.01}
            value={riskPct}
            onChange={(event) => setRiskPct(event.target.value)}
            placeholder="Auto"
            className={inputClass}
          />
        </Field>
        <Field label={type === 'market' ? 'Trigger (n/a)' : 'Trigger price'}>
          <input
            type="number"
            min={0}
            step={0.00001}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            disabled={type === 'market'}
            placeholder={type === 'market' ? 'Market' : 'Required'}
            className={inputClass}
          />
        </Field>
        <Field label="Trailing distance" hint="Price units">
          <input
            type="number"
            min={0}
            step={0.00001}
            value={trailingStop}
            onChange={(event) => setTrailingStop(event.target.value)}
            placeholder="None"
            className={inputClass}
          />
        </Field>
        <Field label="Stop loss" hint="Required by default">
          <input
            type="number"
            min={0}
            step={0.00001}
            value={stopLoss}
            onChange={(event) => setStopLoss(event.target.value)}
            placeholder="Required"
            className={inputClass}
          />
        </Field>
        <Field label="Take profit">
          <input
            type="number"
            min={0}
            step={0.00001}
            value={takeProfit}
            onChange={(event) => setTakeProfit(event.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </Field>
        <Field label="Notes" hint="Shown in the Journal">
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Thesis"
            className={`${inputClass} sm:col-span-2`}
          />
        </Field>
      </div>

      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      ) : null}
      {message ? (
        <div className="border-success/30 bg-success/5 text-success rounded-lg border p-3 text-xs">
          {message}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="bg-brand inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />}
          Place paper order
        </button>
      </div>
    </form>
  );
}
