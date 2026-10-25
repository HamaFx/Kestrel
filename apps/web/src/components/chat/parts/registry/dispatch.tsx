'use client';

// SPDX-License-Identifier: Apache-2.0

// Dispatch for streamed `tool-<name>` chat parts: core names use the bespoke
// registry, plugin tools try their registered UI card, then fall back to the
// automatic card and finally the compact telemetry row.
import { pluginHost } from '@kestrel/plugin-sdk';
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import { isCoreToolName, type CoreToolName } from '@kestrel/shared';
import type { ComponentType, ReactElement } from 'react';

import '@/lib/plugins/register-ui';

import { AutoPluginToolCard } from '../auto-plugin-tool-card';
import { CompactTelemetryRow } from '../compact-telemetry-row';
import { parseBespokeOutput, partRegistry } from './part-registry';
import type { ChatToolPartProps, ToolPartProps, ToolPartState } from './types';

/** Type guard: is `s` a known core tool name? */
function isCoreName(s: string): s is CoreToolName {
  return isCoreToolName(s);
}

/**
 * Translate the registry's part-state vocabulary to the legacy `ToolCard`
 * vocabulary (which mirrors AI SDK v5 stream-part states verbatim). Used
 * only on the fallback path.
 */
function toCardState(
  state: ToolPartState,
): 'input-streaming' | 'output-available' | 'output-error' {
  if (state === 'loading') return 'input-streaming';
  if (state === 'error') return 'output-error';
  return 'output-available';
}

/**
 * Dispatch a streamed `tool-<name>` part.
 *
 * Core tools use the bespoke registry. Plugin tools first look for a custom
 * card registered through `@kestrel/plugin-sdk/ui`; otherwise the
 * `AutoPluginToolCard` formats the payload with zero plugin React code.
 */
export function ChatToolPart({
  name,
  output,
  state,
  errorMessage,
}: ChatToolPartProps): ReactElement {
  if (!isCoreName(name)) {
    return renderPluginPart(name, output, state, errorMessage);
  }

  const rendered = renderBespoke(name, output, state, errorMessage);
  if (rendered !== null) return rendered;

  // zod parse failed — render the raw payload via the generic card so the
  // user can still see something useful (and see the malformed shape if
  // they expand it).
  return renderFallback(name, output, state, errorMessage);
}

/** Render a plugin-provided card, or the automatic formatter. */
function renderPluginPart(
  name: string,
  output: unknown,
  state: ToolPartState,
  errorMessage: string | undefined,
): ReactElement {
  const registration = pluginUiRegistry.getToolPart(name);
  if (registration) {
    const PluginPart = registration.component;
    // Validate against the plugin tool's real output schema (or the UI's
    // explicit override) so a malformed payload never reaches custom code.
    const schema = registration.schema ?? pluginHost.getTool(name)?.outputSchema;
    if (state === 'done' && schema) {
      const parsed = schema.safeParse(output);
      if (!parsed.success) {
        return (
          <AutoPluginToolCard
            name={name}
            output={output}
            state={state}
            errorMessage={errorMessage}
          />
        );
      }
      return (
        <PluginPart
          output={parsed.data}
          state={state}
          {...(errorMessage !== undefined ? { errorMessage } : {})}
        />
      );
    }
    return (
      <PluginPart
        output={output}
        state={state}
        {...(errorMessage !== undefined ? { errorMessage } : {})}
      />
    );
  }

  return (
    <AutoPluginToolCard name={name} output={output} state={state} errorMessage={errorMessage} />
  );
}

/**
 * Render a bespoke part for a known core tool name. Returns `null` to signal
 * the caller should fall back to the generic card (currently only on
 * zod-parse failure when `state === 'done'`).
 *
 * Generic in `K` so `partRegistry[name]` keeps its per-tool typing — the
 * component's `output` prop is exactly `ToolOutput<K> | null`, no casts
 * required at the call site.
 */
function renderBespoke<K extends CoreToolName>(
  name: K,
  output: unknown,
  state: ToolPartState,
  errorMessage: string | undefined,
): ReactElement | null {
  // The map's declared shape `{ [K in CoreToolName]: ComponentType<ToolPartProps<K>> }`
  // makes this index access soundly typed at the per-tool level, but TS
  // can't narrow `partRegistry[name]` past the union when `K` is generic
  // (well-known mapped-type index-access limitation). The cast restores
  // the per-K component type without weakening it to a union.
  const Part = partRegistry[name] as ComponentType<ToolPartProps<K>>;

  // Loading and error states never render the payload, so we don't parse.
  if (state !== 'done' || output === null || output === undefined) {
    return (
      <Part output={null} state={state} {...(errorMessage !== undefined ? { errorMessage } : {})} />
    );
  }

  const result = parseBespokeOutput(name, output);
  if (!result.ok) {
    return null;
  }

  return (
    <Part
      output={result.data}
      state={state}
      {...(errorMessage !== undefined ? { errorMessage } : {})}
    />
  );
}

/** Render the sleek Hoplite-style compact telemetry row for tool execution. */
function renderFallback(
  name: string,
  output: unknown,
  state: ToolPartState,
  errorMessage: string | undefined,
): ReactElement {
  return (
    <CompactTelemetryRow
      name={`tool-${name}`}
      state={toCardState(state)}
      output={output}
      errorMessage={errorMessage}
    />
  );
}
