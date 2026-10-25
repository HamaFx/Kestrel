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

// Core run settings: name, symbol, timeframe, bars, risk, balance, leverage
// and the advanced-costs toggle.
import { inputClass, SYMBOLS, TIMEFRAMES } from './constants';
import { Field } from './field';
import type { NewRunFormController } from './use-new-run-form';

export function BasicFields({ form }: { form: NewRunFormController }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Field label="Name">
        <input
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          placeholder={form.selectedStrategy?.name ?? 'Auto'}
          className={inputClass}
        />
      </Field>
      <Field label="Symbol">
        <input
          value={form.symbol}
          onChange={(event) => form.setSymbol(event.target.value.toUpperCase())}
          list="backtesting-symbols"
          className={inputClass}
        />
        <datalist id="backtesting-symbols">
          {SYMBOLS.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </Field>
      <Field label="Timeframe">
        <select
          value={form.timeframe}
          onChange={(event) => form.setTimeframe(event.target.value)}
          className={inputClass}
        >
          {TIMEFRAMES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Bars" hint="60–5000">
        <input
          type="number"
          min={60}
          max={5000}
          value={form.count}
          onChange={(event) => form.setCount(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Risk / trade %">
        <input
          type="number"
          min={0.01}
          max={10}
          step={0.01}
          value={form.riskPct}
          onChange={(event) => form.setRiskPct(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Starting balance">
        <input
          type="number"
          min={100}
          value={form.initialBalance}
          onChange={(event) => form.setInitialBalance(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Leverage" hint="Blank = plugin default">
        <input
          type="number"
          min={1}
          max={500}
          value={form.leverage}
          onChange={(event) => form.setLeverage(event.target.value)}
          placeholder="Default"
          className={inputClass}
        />
      </Field>
      <Field label="Costs">
        <button
          type="button"
          onClick={form.toggleAdvanced}
          className="border-border/60 text-fg-muted hover:text-fg h-9 rounded-md border px-2.5 text-xs"
        >
          {form.advanced ? 'Hide' : 'Show'} advanced
        </button>
      </Field>
    </div>
  );
}
