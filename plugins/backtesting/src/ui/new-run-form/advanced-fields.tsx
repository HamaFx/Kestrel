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

// Optional execution costs: spread, slippage and commission.
import { inputClass } from './constants';
import { Field } from './field';
import type { NewRunFormController } from './use-new-run-form';

export function AdvancedFields({ form }: { form: NewRunFormController }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Field label="Spread (price)" hint="Blank = 2 pips">
        <input
          type="number"
          min={0}
          step={0.00001}
          value={form.spread}
          onChange={(event) => form.setSpread(event.target.value)}
          placeholder="Default"
          className={inputClass}
        />
      </Field>
      <Field label="Slippage (price)" hint="Blank = 0.5 pips">
        <input
          type="number"
          min={0}
          step={0.00001}
          value={form.slippage}
          onChange={(event) => form.setSlippage(event.target.value)}
          placeholder="Default"
          className={inputClass}
        />
      </Field>
      <Field label="Commission / unit / side">
        <input
          type="number"
          min={0}
          step={0.01}
          value={form.commission}
          onChange={(event) => form.setCommission(event.target.value)}
          placeholder="Default"
          className={inputClass}
        />
      </Field>
    </div>
  );
}
