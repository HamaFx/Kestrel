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

// Strategy source and JSON params editors.
import { Field } from './field';
import type { NewRunFormController } from './use-new-run-form';

export function SourceFields({ form }: { form: NewRunFormController }) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_220px]">
      <Field
        label="Strategy source"
        hint="Must define getSignal(ctx). Accessors reject future offsets."
      >
        <textarea
          value={form.source}
          onChange={(event) => form.setSource(event.target.value)}
          spellCheck={false}
          rows={16}
          className="border-border/60 bg-bg-elev-1 text-fg focus:border-brand/60 min-h-[260px] rounded-md border p-3 font-mono text-[11px] leading-relaxed outline-none"
        />
      </Field>
      <Field label="Params (JSON)" hint="Available as ctx.params">
        <textarea
          value={form.params}
          onChange={(event) => form.setParams(event.target.value)}
          spellCheck={false}
          rows={16}
          className="border-border/60 bg-bg-elev-1 text-fg focus:border-brand/60 min-h-[260px] rounded-md border p-3 font-mono text-[11px] leading-relaxed outline-none"
        />
      </Field>
    </div>
  );
}
