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

// Guided setup drawer for `installMode: 'wizard'` plugins.
//
// Steps are declarative (`manifest.setupSteps`). The drawer renders one step
// at a time, saves credentials through /api/plugins/manage, and invokes
// plugin-owned action endpoints with the convention:
//
//   POST /api/plugins/<pluginId>/setup/<actionId>
//
// Action responses may return `{ ok, message, values, url }`; `values` is
// merged into the form state (e.g. an auto-generated link token) and `url`
// is rendered as the primary call to action.
import { PLUGIN_SECRET_MASK, type PluginSetupStep } from '@kestrel/plugin-sdk';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconExternalLink,
  IconLoader2,
  IconPlugConnected,
  IconSettings,
  IconShieldLock,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/formatters/cn';
import { ApiError, apiMutate } from '@/lib/http/api-client';
import type { PluginStoreEntry } from '@/lib/plugins/types';

import { AutoZodSettingsForm, type PluginSettingsValues } from './auto-zod-settings-form';

interface SetupActionResponse {
  ok?: boolean;
  message?: string;
  values?: Record<string, unknown>;
  url?: string;
  error?: { message?: string };
}

export interface PluginSetupDrawerProps {
  entry: PluginStoreEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (entry: PluginStoreEntry) => void;
  onRefresh: () => Promise<PluginStoreEntry | null>;
}

function initialValues(entry: PluginStoreEntry | null): PluginSettingsValues {
  if (!entry) return {};
  const values: PluginSettingsValues = {};
  for (const field of entry.settingsFields) {
    if (field.defaultValue !== undefined) values[field.key] = field.defaultValue;
  }
  return { ...values, ...entry.settings };
}

function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (error instanceof ApiError && error.details && typeof error.details === 'object') {
    const flatten = error.details as {
      fieldErrors?: Record<string, string[] | undefined>;
    };
    if (flatten.fieldErrors) {
      return Object.fromEntries(
        Object.entries(flatten.fieldErrors)
          .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
          .map(([key, messages]) => [key, String(messages?.[0] ?? 'Invalid value')]),
      );
    }
  }
  return {};
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0 || value === PLUGIN_SECRET_MASK;
  }
  return true;
}

function expandUrl(template: string, values: PluginSettingsValues): string {
  const whole = /^\{([a-zA-Z0-9_]+)\}$/.exec(template.trim());
  if (whole) {
    const value = values[whole[1] ?? ''];
    return value === undefined || value === null ? '' : String(value);
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? '' : encodeURIComponent(String(value));
  });
}

function StepIcon({ kind }: { kind: PluginSetupStep['kind'] }) {
  if (kind === 'credentials') return <IconShieldLock className="size-4" />;
  if (kind === 'action') return <IconPlugConnected className="size-4" />;
  if (kind === 'link') return <IconExternalLink className="size-4" />;
  return <IconCheck className="size-4" />;
}

export function PluginSetupDrawer({
  entry,
  open,
  onOpenChange,
  onChanged,
  onRefresh,
}: PluginSetupDrawerProps) {
  const [values, setValues] = useState<PluginSettingsValues>(() => initialValues(entry));
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionUrl, setActionUrl] = useState<string | null>(null);
  const [wizardComplete, setWizardComplete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(initialValues(entry));
    setStepIndex(0);
    setErrors({});
    setActionUrl(null);
    setWizardComplete(false);
    // Reset only when the drawer opens or a different plugin is selected.
    // An action refresh updates the entry but must not discard wizard state
    // (for example the `linkUrl` generated by the create-link step).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const steps = entry?.setupSteps ?? [];
  const wizardMode = entry?.installMode === 'wizard' && steps.length > 0;
  const showWizard =
    wizardMode && entry?.enabled === true && !entry?.onboardingCompleted && !wizardComplete;
  const currentStep = showWizard ? steps[stepIndex] : undefined;

  const stepFieldKeys = useMemo(() => currentStep?.fields ?? [], [currentStep]);
  const stepFields = useMemo(
    () =>
      stepFieldKeys.length > 0
        ? (entry?.settingsFields.filter((field) => stepFieldKeys.includes(field.key)) ?? [])
        : [],
    [entry?.settingsFields, stepFieldKeys],
  );

  const stepHasFields = stepFields.length > 0;

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const validateFields = useCallback(
    (fields: PluginStoreEntry['settingsFields']): boolean => {
      const next: Record<string, string> = {};
      for (const field of fields) {
        if (!field.required) continue;
        if (!isPresent(values[field.key])) {
          next[field.key] = `${field.label} is required`;
        }
      }
      setErrors(next);
      return Object.keys(next).length === 0;
    },
    [values],
  );

  const saveSettings = useCallback(
    async (options?: { completeOnboarding?: boolean; silent?: boolean }): Promise<boolean> => {
      if (!entry) return false;
      setBusy(true);
      setErrors({});
      try {
        const response = await apiMutate<{
          plugin: PluginStoreEntry;
          message: string;
          warning?: string;
        }>('/api/plugins/manage', {
          method: 'POST',
          body: JSON.stringify({
            action: 'update-settings',
            pluginId: entry.id,
            settings: values,
            ...(options?.completeOnboarding !== undefined
              ? { completeOnboarding: options.completeOnboarding }
              : {}),
          }),
        });
        onChanged(response.plugin);
        if (response.warning) {
          toast.warning('Saved with a warning', { description: response.warning });
        } else if (!options?.silent) {
          toast.success(response.message);
        }
        return true;
      } catch (err) {
        const fieldErrors = fieldErrorsFrom(err);
        setErrors(fieldErrors);
        toast.error('Could not save settings', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [entry, onChanged, values],
  );

  const runAction = useCallback(
    async (step: PluginSetupStep): Promise<void> => {
      if (!entry || !step.action) return;
      if (stepHasFields && !validateFields(stepFields)) return;

      setActionBusy(step.action.id);
      try {
        // Persist any credentials before the action runs (the plugin's action
        // handler reads the saved settings).
        if (stepHasFields) {
          const saved = await saveSettings({ silent: true });
          if (!saved) return;
        }

        const response = await apiMutate<SetupActionResponse>(
          `/api/plugins/${entry.id}/setup/${step.action.id}`,
          {
            method: 'POST',
            body: JSON.stringify({ settings: values }),
          },
        );

        if (response.values) {
          setValues((current) => ({ ...current, ...response.values }));
        }
        if (response.url) {
          setActionUrl(response.url);
        }
        if (response.ok === false) {
          toast.error(step.action.label, {
            description: response.message ?? response.error?.message ?? 'The action failed',
          });
          return;
        }

        toast.success(response.message ?? step.action.label);
        await onRefresh();
        setStepIndex((index) => Math.min(index + 1, steps.length));
      } catch (err) {
        toast.error(step.action.label, {
          description: err instanceof Error ? err.message : 'The action failed',
        });
      } finally {
        setActionBusy(null);
      }
    },
    [
      entry,
      onRefresh,
      saveSettings,
      stepFields,
      stepHasFields,
      steps.length,
      validateFields,
      values,
    ],
  );

  const goNext = useCallback(async () => {
    if (!currentStep) return;
    if (currentStep.kind === 'action' && currentStep.action) {
      await runAction(currentStep);
      return;
    }
    if (stepHasFields && !validateFields(stepFields)) return;
    if (stepHasFields) {
      const saved = await saveSettings({ silent: true });
      if (!saved) return;
    }
    setStepIndex((index) => Math.min(index + 1, steps.length));
  }, [
    currentStep,
    runAction,
    saveSettings,
    stepFields,
    stepHasFields,
    steps.length,
    validateFields,
  ]);

  const finish = useCallback(async () => {
    if (!entry) return;
    const allFields = entry.settingsFields;
    if (!validateFields(allFields)) return;
    const saved = await saveSettings({ completeOnboarding: true });
    if (saved) {
      setWizardComplete(true);
      await onRefresh();
    }
  }, [entry, onRefresh, saveSettings, validateFields]);

  if (!entry) return null;

  const isLastStep = showWizard && stepIndex >= steps.length - 1;
  const primaryDisabled = busy || actionBusy !== null;
  const resolvedUrl = actionUrl ?? null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto w-full max-w-2xl">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <DrawerTitle>{entry.name}</DrawerTitle>
              <DrawerDescription>{entry.tagline}</DrawerDescription>
            </div>
            <Badge tone={entry.installed ? (entry.enabled ? 'success' : 'warn') : 'neutral'}>
              {entry.installed ? (entry.enabled ? 'Installed' : 'Disabled') : 'Available'}
            </Badge>
          </div>
        </DrawerHeader>

        <div className="scrollbar-hide flex-1 overflow-y-auto px-4 pb-2">
          {showWizard ? (
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
                    <h3 className="text-fg text-base font-semibold tracking-tight">
                      {currentStep.title}
                    </h3>
                    <p className="text-fg-subtle text-sm whitespace-pre-line">
                      {currentStep.description}
                    </p>
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
                  <p className="text-danger text-xs">
                    Fix the highlighted fields before continuing.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <IconSettings className="text-fg-subtle size-4" />
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
                    setWizardComplete(false);
                    setStepIndex(0);
                  }}
                  className="self-start"
                >
                  Re-run guided setup
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <DrawerFooter>
          {showWizard ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                disabled={stepIndex === 0 || primaryDisabled}
              >
                <IconArrowLeft className="size-4" />
                Back
              </Button>
              {isLastStep ? (
                <Button
                  type="button"
                  onClick={() => void finish()}
                  loading={busy}
                  disabled={primaryDisabled}
                  className="flex-1"
                >
                  <IconCheck className="size-4" />
                  Finish setup
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void goNext()}
                  loading={busy || actionBusy !== null}
                  disabled={primaryDisabled}
                  className="flex-1"
                >
                  Continue
                  <IconArrowRight className="size-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => void saveSettings()}
                loading={busy}
                disabled={busy}
              >
                <IconCheck className="size-4" />
                Save settings
              </Button>
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
