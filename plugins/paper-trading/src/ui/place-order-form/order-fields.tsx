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
import { fmtMoneyPlain, PLUGIN_UI_CLASSES } from '../format';
import {
  type Account,
  type OrderFormState,
  type OrderFormValues,
  type OrderType,
} from './use-place-order';

const inputClass = PLUGIN_UI_CLASSES.input;

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
    <label data-slot="field" className="flex flex-col gap-1.5">
      <span data-slot="field-label" className={PLUGIN_UI_CLASSES.fieldLabel}>
        {label}
      </span>
      {children}
      {hint ? (
        <span data-slot="field-description" className="text-fg-subtle text-[11px]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function OrderFields({
  accounts,
  selected,
  state,
  setField,
}: {
  accounts: readonly Account[];
  selected?: Account | undefined;
  state: OrderFormState;
  setField: (patch: Partial<OrderFormValues>) => void;
}) {
  const enteredRisk = state.riskPct.trim() === '' ? null : Number(state.riskPct);
  const effectiveRisk =
    enteredRisk !== null && Number.isFinite(enteredRisk) && enteredRisk > 0
      ? enteredRisk
      : (selected?.riskPerTradePct ?? 1);
  const riskDollars =
    selected && Number.isFinite(effectiveRisk) ? (selected.equity * effectiveRisk) / 100 : null;
  const sliderValue = Math.min(2, Math.max(0.1, effectiveRisk || 1));

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Field label="Account">
        <select
          value={state.accountRef}
          onChange={(event) => setField({ accountRef: event.target.value })}
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
          value={state.symbol}
          onChange={(event) => setField({ symbol: event.target.value.toUpperCase() })}
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
          value={state.type}
          onChange={(event) => setField({ type: event.target.value as OrderType })}
          className={inputClass}
        >
          <option value="market">Market</option>
          <option value="limit">Limit</option>
          <option value="stop">Stop</option>
        </select>
      </Field>
      <Field label="Time in force">
        <select
          value={state.timeInForce}
          onChange={(event) =>
            setField({ timeInForce: event.target.value === 'day' ? 'day' : 'gtc' })
          }
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
          value={state.quantity}
          onChange={(event) => setField({ quantity: event.target.value })}
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
          value={state.riskPct}
          onChange={(event) => setField({ riskPct: event.target.value })}
          placeholder="Auto"
          className={inputClass}
        />
        <input
          type="range"
          min={0.1}
          max={2}
          step={0.05}
          value={sliderValue}
          aria-label="Risk percentage slider"
          onChange={(event) => setField({ riskPct: event.target.value })}
          className="accent-brand mt-1 w-full cursor-pointer"
        />
        <span
          className={
            effectiveRisk > 1
              ? 'text-warn text-[11px] leading-snug'
              : 'text-fg-subtle text-[11px] leading-snug'
          }
        >
          {riskDollars !== null
            ? `≈ ${fmtMoneyPlain(riskDollars)} at risk on ${fmtMoneyPlain(selected?.equity ?? 0)} equity`
            : 'Exact risk is calculated on submit.'}
          {effectiveRisk > 1 ? ' · Above the 1.0% risk default' : ''}
        </span>
      </Field>
      <Field label={state.type === 'market' ? 'Trigger (n/a)' : 'Trigger price'}>
        <input
          type="number"
          min={0}
          step={0.00001}
          value={state.price}
          onChange={(event) => setField({ price: event.target.value })}
          disabled={state.type === 'market'}
          placeholder={state.type === 'market' ? 'Market' : 'Required'}
          className={inputClass}
        />
      </Field>
      <Field label="Trailing distance" hint="Price units">
        <input
          type="number"
          min={0}
          step={0.00001}
          value={state.trailingStop}
          onChange={(event) => setField({ trailingStop: event.target.value })}
          placeholder="None"
          className={inputClass}
        />
      </Field>
      <Field label="Stop loss" hint="Required by default">
        <input
          type="number"
          min={0}
          step={0.00001}
          value={state.stopLoss}
          onChange={(event) => setField({ stopLoss: event.target.value })}
          placeholder="Required"
          className={inputClass}
        />
      </Field>
      <Field label="Take profit">
        <input
          type="number"
          min={0}
          step={0.00001}
          value={state.takeProfit}
          onChange={(event) => setField({ takeProfit: event.target.value })}
          placeholder="Optional"
          className={inputClass}
        />
      </Field>
      <Field label="Notes" hint="Shown in the Journal">
        <input
          value={state.notes}
          onChange={(event) => setField({ notes: event.target.value })}
          placeholder="Thesis"
          className={`${inputClass} sm:col-span-2`}
        />
      </Field>
    </div>
  );
}
