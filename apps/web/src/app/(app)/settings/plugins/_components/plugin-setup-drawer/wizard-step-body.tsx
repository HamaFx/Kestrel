'use client';

// SPDX-License-Identifier: Apache-2.0

// Wizard body: progress rail, step header, per-step field group, link/action
// affordances, and the completion + error banners.
import {
  IconAlertTriangle,
  IconCheck,
  IconExternalLink,
  IconLoader2,
  IconPlugConnected,
  IconSettings,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';
import type { PluginStoreEntry } from '@/lib/plugins/types';

import { AutoZodSettingsForm } from '../auto-zod-settings-form';
import { expandUrl, StepIcon } from './setup-helpers';
import type { PluginSetupController } from './use-plugin-setup';

export function WizardStepBody({
  entry,
  controller,
}: {
  entry: PluginStoreEntry;
  controller: PluginSetupController;
}) {
  const {
    values,
    stepIndex,
    busy,
    actionBusy,
    errors,
    actionUrl,
    wizardMode,
    showWizard,
    currentStep,
    stepFieldKeys,
    stepHasFields,
    handleChange,
    runAction,
    primaryDisabled,
  } = controller;

  if (!showWizard) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <IconSettingsMarker />
          <h3 className="text-fg text-sm font-semibold">Plugin settings</h3>
        </div>
        <AutoZodSettingsForm
          fields={entry.settingsFields}
          values={values}
          onChange={handleChange}
          errors={errors}
          disabled={busy}
        />
        {wizardMode ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              controller.setWizardComplete(false);
              controller.setStepIndex(0);
            }}
            className="self-start"
          >
            Re-run guided setup
          </Button>
        ) : null}
      </div>
    );
  }

  const steps = controller.steps;
  const resolvedUrl = actionUrl ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* Progress */}
      <div className="flex items-center gap-2" aria-label="Setup progress">
        {steps.map((step, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <div
              key={step.id}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                done ? 'bg-success' : active ? 'bg-brand' : 'bg-bg-elev-3',
              )}
              title={step.title}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="bg-bg-elev-2 text-fg-muted flex size-8 items-center justify-center rounded-md">
          <StepIcon kind={currentStep?.kind ?? 'instructions'} />
        </span>
        <div className="flex flex-col">
          <span className="text-fg text-sm font-semibold">
            Step {Math.min(stepIndex + 1, steps.length)} of {steps.length}
          </span>
          <span className="text-fg-subtle text-xs">
            {currentStep?.optional ? 'Optional step' : 'Guided setup'}
          </span>
        </div>
      </div>

      {currentStep ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-fg text-base font-semibold tracking-tight">{currentStep.title}</h3>
            <p className="text-fg-subtle text-sm whitespace-pre-line">{currentStep.description}</p>
          </div>

          {stepHasFields ? (
            <AutoZodSettingsForm
              fields={entry.settingsFields}
              values={values}
              onChange={handleChange}
              errors={errors}
              disabled={primaryDisabled}
              onlyKeys={stepFieldKeys}
            />
          ) : null}

          {currentStep.link ? (
            <a
              href={resolvedUrl ?? expandUrl(currentStep.link.urlTemplate, values)}
              target="_blank"
              rel="noopener noreferrer"
              className="border-brand/40 bg-brand/10 text-brand hover:bg-brand/15 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors"
            >
              <IconExternalLink className="size-4" />
              {currentStep.link.label}
            </a>
          ) : null}

          {currentStep.kind === 'action' && currentStep.action ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void runAction(currentStep)}
                disabled={primaryDisabled}
              >
                {actionBusy === currentStep.action.id ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconPlugConnected className="size-4" />
                )}
                {currentStep.action.label}
              </Button>
              {resolvedUrl ? (
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand inline-flex items-center gap-1.5 text-xs font-semibold"
                >
                  <IconExternalLink className="size-3.5" />
                  Open the generated link
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <div className="border-success/30 bg-success/5 flex items-start gap-2 rounded-md border p-3">
          <IconCheck className="text-success mt-0.5 size-4 shrink-0" />
          <p className="text-fg text-sm">
            Setup is complete. Your workspace and AI agents now include {entry.name}.
          </p>
        </div>
      )}

      {Object.keys(errors).length > 0 ? (
        <div className="border-danger/30 bg-danger/5 flex items-start gap-2 rounded-md border p-3">
          <IconAlertTriangle className="text-danger mt-0.5 size-4 shrink-0" />
          <p className="text-danger text-xs">Fix the highlighted fields before continuing.</p>
        </div>
      ) : null}
    </div>
  );
}

function IconSettingsMarker() {
  return <IconSettings className="text-fg-subtle size-4" />;
}
