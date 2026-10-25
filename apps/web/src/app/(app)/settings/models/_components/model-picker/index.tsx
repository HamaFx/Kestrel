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
import type { ProviderMeta } from '@kestrel/shared';
import { IconCheck, IconChevronDown, IconLoader2 } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { SkeletonCard } from '@/components/ui/skeleton';

import { type ModelPickerKind } from './model-options';
import { HELPERS, NO_PROVIDERS_COPY, NO_PROVIDERS_ICONS, TITLES } from './model-picker-copy';
import { ProviderOptions } from './provider-group';
import { useModelPicker } from './use-model-picker';

/**
 * Phase D2 — generic per-domain model picker. One component powers
 * the chat / vision / embedding pickers on /settings/models. The
 * differences between domains are:
 *
 *   - Which API endpoint to call (chat-model / vision-model / embedding-model)
 *   - Which tier + capability filter to apply to the option list
 *   - Empty-state copy pointing at the right provider capability
 *   - Helper text describing what this model is used for
 *
 * Everything else (the picker chrome, save flow, delete flow,
 * hydrated-from-API pattern) is shared.
 */
export interface ModelPickerProps {
  /** Which domain this picker covers — drives endpoint + filter + copy. */
  kind: ModelPickerKind;
  /**
   * Currently-saved value ("<providerId>:<bareModelId>"). Pass null
   * to have the picker fetch it on mount.
   */
  initialValue?: string | null;
  /** Providers from the catalog endpoint (server filtered to configured). */
  providers: ProviderMeta[];
  /** Override the default title shown above the current-value row. */
  title?: string;
  /** Override the default helper paragraph under the dropdown. */
  helper?: string;
}

export type { ModelPickerKind } from './model-options';

export function ModelPicker({
  kind,
  initialValue = null,
  providers,
  title,
  helper,
}: ModelPickerProps) {
  const { value, hydrated, save, pending, options, currentLabel, pick, clearOverride } =
    useModelPicker({ kind, initialValue, providers });

  if (!hydrated) {
    return <SkeletonCard lines={3} />;
  }

  if (providers.length === 0 || options.length === 0) {
    const NoProviderIcon = NO_PROVIDERS_ICONS[kind];
    return (
      <div className="border-border bg-bg-elev-1 flex flex-col items-center gap-3 rounded-sm border p-6 text-center">
        <div className="bg-bg-elev-2 text-fg-subtle flex size-10 items-center justify-center rounded-sm">
          <NoProviderIcon className="size-6" />
        </div>
        <div>
          <h3 className="text-fg text-sm font-semibold">No providers available</h3>
          <p className="text-caption text-fg-subtle mt-1 max-w-md">
            Add an API key in{' '}
            <a href="/settings/api-keys" className="text-fg hover:underline">
              Settings → API Keys
            </a>{' '}
            {NO_PROVIDERS_COPY[kind]}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-fg text-sm font-medium">{title ?? TITLES[kind]}</span>
          <span className="text-caption text-fg-subtle tabular-nums">{currentLabel}</span>
        </div>
        {value ? (
          <span className="text-caption text-success inline-flex items-center gap-1">
            <IconCheck size={12} aria-hidden="true" />
            Saved
          </span>
        ) : (
          <span className="text-caption text-fg-subtle">No override</span>
        )}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-caption text-fg-subtle tracking-wide uppercase">Pick a model</span>
        <div className="relative">
          <select
            value={value ?? ''}
            onChange={(e) => pick(e.target.value)}
            disabled={pending || save.kind === 'pending'}
            className="border-border bg-bg-elev-2 text-fg focus:ring-fg w-full appearance-none rounded-sm border py-2 pr-9 pl-3 text-sm focus:ring-2 focus:outline-none disabled:opacity-60"
          >
            <option value="" disabled>
              Use fallback ({options[0]?.label ?? '—'})
            </option>
            {providers.map((provider) => (
              <ProviderOptions key={provider.id} provider={provider} kind={kind} />
            ))}
          </select>
          {pending || save.kind === 'pending' ? (
            <IconLoader2
              size={14}
              className="text-fg-subtle absolute top-1/2 right-3 -translate-y-1/2 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <IconChevronDown
              size={14}
              className="text-fg-subtle pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
              aria-hidden="true"
            />
          )}
        </div>
      </label>

      {save.kind === 'error' ? (
        <div className="text-caption text-danger">{save.message}</div>
      ) : null}

      <p className="text-caption text-fg-subtle">{helper ?? HELPERS[kind]}</p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => void clearOverride()}
        disabled={!value || pending || save.kind === 'pending'}
      >
        Clear override
      </Button>
    </div>
  );
}

/* ---------- Thin wrappers that pin the `kind` prop ---------- */

export function ChatModelPicker(props: Omit<ModelPickerProps, 'kind'>) {
  return <ModelPicker {...props} kind="chat" />;
}

export function VisionModelPicker(props: Omit<ModelPickerProps, 'kind'>) {
  return <ModelPicker {...props} kind="vision" />;
}

export function EmbeddingModelPicker(props: Omit<ModelPickerProps, 'kind'>) {
  return <ModelPicker {...props} kind="embedding" />;
}
