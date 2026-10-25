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
import { IconArrowLeft, IconArrowRight, IconCheck } from '@tabler/icons-react';

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
import type { PluginStoreEntry } from '@/lib/plugins/types';

import { usePluginSetup } from './use-plugin-setup';
import { WizardStepBody } from './wizard-step-body';

export interface PluginSetupDrawerProps {
  entry: PluginStoreEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (entry: PluginStoreEntry) => void;
  onRefresh: () => Promise<PluginStoreEntry | null>;
}

export function PluginSetupDrawer({
  entry,
  open,
  onOpenChange,
  onChanged,
  onRefresh,
}: PluginSetupDrawerProps) {
  const controller = usePluginSetup({ entry, open, onChanged, onRefresh });
  const { busy, actionBusy, showWizard, stepIndex, setStepIndex, saveSettings } = controller;

  if (!entry) return null;

  const { isLastStep, primaryDisabled, goNext, finish } = controller;

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
          <WizardStepBody entry={entry} controller={controller} />
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
