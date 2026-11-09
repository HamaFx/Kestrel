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

// Visual strategy template builder with an optional toggleable code editor.
import { IconAdjustments, IconCheck, IconCode } from '@tabler/icons-react';
import { useState } from 'react';

import {
  buildDefaultParams,
  DEFAULT_TEMPLATE,
  inputClass,
  STRATEGY_TEMPLATES,
  type StrategyTemplate,
} from './constants';
import { Field } from './field';
import type { NewRunFormController } from './use-new-run-form';

export function SourceFields({ form }: { form: NewRunFormController }) {
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE.id);
  const [templateParams, setTemplateParams] = useState<Record<string, number>>(() =>
    buildDefaultParams(DEFAULT_TEMPLATE),
  );
  const [showCodeEditor, setShowCodeEditor] = useState(false);

  const activeTemplate: StrategyTemplate =
    STRATEGY_TEMPLATES.find((entry) => entry.id === templateId) ?? DEFAULT_TEMPLATE;

  function selectTemplate(nextTemplate: StrategyTemplate) {
    const nextParams = buildDefaultParams(nextTemplate);
    setTemplateId(nextTemplate.id);
    setTemplateParams(nextParams);
    form.setName(nextTemplate.name);
    form.setParams(JSON.stringify(nextParams, null, 2));
    form.setSource(nextTemplate.buildSource(nextParams));
  }

  function updateParam(key: string, rawValue: string, fallback: number) {
    const numeric = Number(rawValue);
    const value = Number.isFinite(numeric) ? numeric : fallback;
    const nextParams = { ...templateParams, [key]: value };
    setTemplateParams(nextParams);
    form.setParams(JSON.stringify(nextParams, null, 2));
    form.setSource(activeTemplate.buildSource(nextParams));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconAdjustments className="text-brand size-4" />
            <div>
              <h3 className="text-fg text-xs font-semibold">Visual Strategy Setup</h3>
              <p className="text-fg-subtle text-[11px]">
                Select a ready-made strategy template and tune its parameters without writing code.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCodeEditor((prev) => !prev)}
            className="border-border bg-[#0e0f11]/90 text-fg-muted hover:text-fg inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors"
          >
            <IconCode className="size-3.5" />
            {showCodeEditor ? 'Hide Strategy Code' : 'Advanced: Edit Strategy Code'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {STRATEGY_TEMPLATES.map((template) => {
            const isSelected = template.id === activeTemplate.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template)}
                className={
                  isSelected
                    ? 'border-brand/60 bg-brand/10 flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors'
                    : 'border-border bg-[#0e0f11]/90 hover:border-brand/40 flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors'
                }
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-fg text-xs font-semibold">{template.name}</span>
                  {isSelected ? (
                    <span className="bg-brand/20 text-brand inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold">
                      <IconCheck className="size-3" />
                      Selected
                    </span>
                  ) : null}
                </div>
                <p className="text-fg-muted text-[11px] leading-relaxed">{template.summary}</p>
              </button>
            );
          })}
        </div>

        <div className="border-border/60 border-t pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-fg-subtle text-[11px] font-semibold tracking-wider uppercase">
              {activeTemplate.name} Parameters
            </span>
            <span className="text-fg-subtle text-[11px]">
              Updates strategy rules automatically
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {activeTemplate.params.map((spec) => (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <input
                  type="number"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={templateParams[spec.key] ?? spec.defaultValue}
                  onChange={(event) =>
                    updateParam(spec.key, event.target.value, spec.defaultValue)
                  }
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </div>
      </div>

      {showCodeEditor ? (
        <div className="border-border bg-bg-elev-1 grid grid-cols-1 gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_240px]">
          <Field
            label="Strategy code (JavaScript)"
            hint="Defines getSignal(ctx) evaluated on each historical candle."
          >
            <textarea
              value={form.source}
              onChange={(event) => form.setSource(event.target.value)}
              spellCheck={false}
              rows={14}
              className="border-border bg-[#0e0f11]/90 text-fg focus:border-brand/60 min-h-[240px] rounded-lg border p-3 font-mono text-xs leading-relaxed outline-none"
            />
          </Field>
          <Field label="Parameters (JSON)" hint="Passed to your strategy as ctx.params">
            <textarea
              value={form.params}
              onChange={(event) => form.setParams(event.target.value)}
              spellCheck={false}
              rows={14}
              className="border-border bg-[#0e0f11]/90 text-fg focus:border-brand/60 min-h-[240px] rounded-lg border p-3 font-mono text-xs leading-relaxed outline-none"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
