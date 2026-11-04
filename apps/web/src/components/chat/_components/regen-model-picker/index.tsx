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
import { useState } from 'react';

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
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const highlightLayoutId = `regen-picker-pill-${popoverId}`;

  function pick(modelId: string) {
    onPick(modelId);
    const popover = document.getElementById(popoverId);
    (popover as HTMLElement | null)?.hidePopover?.();
  }

  if (loading) {
    return (
      <div className="text-fg-subtle flex items-center gap-2 px-3 py-2.5 font-mono text-xs">
        <IconLoader2 size={12} className="text-brand animate-spin" aria-hidden="true" />
        Loading model matrix…
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

  const defaultRowKey = chatFullyQualified ? `default:${chatFullyQualified}` : null;

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHoveredRowKey(null)}
      role="menu"
      tabIndex={-1}
      className="flex max-h-96 min-w-72 flex-col gap-2 overflow-y-auto p-0.5 focus:outline-none sm:min-w-80"
    >
      {/* My default — the chat_model the user saved in /settings/models */}
      <section className="flex flex-col gap-0.5">
        <div className="text-fg-subtle px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">
          Primary Default
        </div>
        {chatProvider && chatCatalogModel && chatFullyQualified && defaultRowKey ? (
          <RegenRow
            label={`${chatProvider.displayName} · ${chatCatalogModel.label ?? chatCatalogModel.modelId}`}
            fullyQualified={chatFullyQualified}
            isActive={modelSelectionMatches(
              activeModelId,
              chatProvider.id,
              chatCatalogModel.modelId,
            )}
            isHighlighted={hoveredRowKey === defaultRowKey}
            highlightLayoutId={highlightLayoutId}
            tier={chatCatalogModel.tier}
            hasVision={Boolean(chatCatalogModel.capabilities?.vision)}
            contextTokens={chatCatalogModel.contextTokens}
            onHover={() => setHoveredRowKey(defaultRowKey)}
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
      <section className="border-border/40 flex flex-col gap-1 border-t pt-1.5">
        <div className="text-fg-subtle px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">
          Configured Engines
        </div>
        {configured.map((p) => (
          <div key={p.id} className="flex flex-col gap-0.5">
            <div className="text-fg-muted flex items-center justify-between px-2 pt-1.5 pb-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase">
              <span>{p.displayName}</span>
              {p.bestFor ? (
                <span className="text-fg-subtle font-sans text-[10px] font-normal tracking-normal normal-case">
                  {p.bestFor}
                </span>
              ) : null}
            </div>
            {p.models.map((m) => {
              const fullyQualified = toQualifiedModelId(p.id, m.modelId);
              const rowKey = `${p.id}/${m.modelId}`;
              return (
                <RegenRow
                  key={rowKey}
                  label={m.label ?? m.modelId}
                  fullyQualified={fullyQualified}
                  isActive={modelSelectionMatches(activeModelId, p.id, m.modelId)}
                  isHighlighted={hoveredRowKey === rowKey}
                  highlightLayoutId={highlightLayoutId}
                  tier={m.tier}
                  hasVision={Boolean(m.capabilities?.vision)}
                  contextTokens={m.contextTokens}
                  onHover={() => setHoveredRowKey(rowKey)}
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
