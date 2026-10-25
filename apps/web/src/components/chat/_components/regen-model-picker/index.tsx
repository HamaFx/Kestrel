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
import { IconLoader2 } from '@tabler/icons-react';

import { modelSelectionMatches, toChatModelValue, toQualifiedModelId } from '../model-picker-utils';
import { RegenRow } from './regen-row';
import { useModelCatalog } from './use-model-catalog';
import { useModelMenuKeyboard } from './use-model-menu-keyboard';

interface RegenModelPickerProps {
  popoverId: string;
  /**
   * Currently-applied model for this thread, e.g. "google/gemini-2.5-flash".
   * Used to highlight the active row in the menu. Optional — when
   * omitted, no row is marked active.
   */
  activeModelId?: string | null;
  onPick: (modelId: string) => void;
}

/**
 * Phase F — replaces the 5-domain picker with a single chat_model
 * picker. The "My default" section is now just one row (the user's
 * saved chat_model). The per-provider full list is unchanged so
 * the user can override per-turn without losing access to the rest.
 *
 * Fetched lazily on first open so we don't block the chat thread.
 */
export function RegenModelPicker({ popoverId, activeModelId, onPick }: RegenModelPickerProps) {
  const { catalog, chatModel, loading } = useModelCatalog();
  const { containerRef, handleKeyDown } = useModelMenuKeyboard({
    loading,
    activeModelId,
    popoverId,
  });

  function pick(modelId: string) {
    onPick(modelId);
    const popover = document.getElementById(popoverId);
    (popover as HTMLElement | null)?.hidePopover?.();
  }

  if (loading) {
    return (
      <div className="text-fg-subtle flex items-center gap-2 px-3 py-2 text-xs">
        <IconLoader2 size={12} className="animate-spin" aria-hidden="true" />
        Loading models…
      </div>
    );
  }

  if (!catalog || catalog.providers.length === 0) {
    return (
      <div className="text-fg-subtle px-3 py-2 text-xs">
        Add a key in Settings → API Keys to see model options.
      </div>
    );
  }

  const configured = catalog.providers.filter((p) => p.hasKey);
  if (configured.length === 0) {
    return (
      <div className="text-fg-subtle px-3 py-2 text-xs">
        Add a key in Settings → API Keys to see model options.
      </div>
    );
  }

  // Find the chat-model row by parsing "<providerId>:<bareModelId>"
  // and matching against the configured providers' full catalog.
  const chatModelParts = chatModel?.split(':');
  const chatProvider = chatModelParts
    ? configured.find((p) => p.id === chatModelParts[0])
    : undefined;
  const chatBare = chatModelParts?.[1];
  const chatCatalogModel = chatProvider?.models.find((m) =>
    chatBare ? modelSelectionMatches(chatModel, chatProvider.id, m.modelId) : false,
  );
  const chatFullyQualified =
    chatProvider && chatCatalogModel
      ? toQualifiedModelId(chatProvider.id, chatCatalogModel.modelId)
      : null;

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      role="menu"
      tabIndex={-1}
      className="flex max-h-96 min-w-72 flex-col gap-2 overflow-y-auto focus:outline-none"
    >
      {/* My default — the chat_model the user saved in /settings/models */}
      <section className="flex flex-col gap-0.5">
        <div className="text-caption text-fg-subtle px-2 py-1 tracking-wide uppercase">
          My default
        </div>
        {chatProvider && chatCatalogModel && chatFullyQualified ? (
          <RegenRow
            label={`${chatProvider.displayName} · ${chatCatalogModel.label ?? chatCatalogModel.modelId}`}
            fullyQualified={chatFullyQualified}
            isActive={modelSelectionMatches(
              activeModelId,
              chatProvider.id,
              chatCatalogModel.modelId,
            )}
            onClick={() => pick(toChatModelValue(chatProvider.id, chatCatalogModel.modelId))}
          />
        ) : (
          <div className="text-caption text-fg-subtle px-2 py-1 italic">
            No default set.{' '}
            <a href="/settings/models" className="text-fg not-italic hover:underline">
              Pick one in Settings → Models
            </a>
            .
          </div>
        )}
      </section>

      {/* Per-provider model list */}
      <section className="flex flex-col gap-0.5">
        <div className="text-caption text-fg-subtle px-2 py-1 tracking-wide uppercase">
          All configured models
        </div>
        {configured.map((p) => (
          <div key={p.id} className="flex flex-col gap-0.5">
            <div className="text-caption text-fg-muted px-2 pt-1.5 pb-0.5">{p.displayName}</div>
            {p.models.map((m) => {
              const fullyQualified = toQualifiedModelId(p.id, m.modelId);
              return (
                <RegenRow
                  key={`${p.id}/${m.modelId}`}
                  label={m.label ?? m.modelId}
                  fullyQualified={fullyQualified}
                  isActive={modelSelectionMatches(activeModelId, p.id, m.modelId)}
                  onClick={() => pick(toChatModelValue(p.id, m.modelId))}
                />
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
